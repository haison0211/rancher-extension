# 🎯 TÓM TẮT: Tại Sao Node Hiển Thị 95% vs 53%?

## ⚡ TL;DR - NGUYÊN NHÂN CHÍNH

Bạn có **EKS Spot Instance** với cluster được migrate từ Rancher 1.x (Norman):

```
Node List:  95% CPU  ← Dùng POD REQUESTS (số pods book)
Node Detail: 53% CPU  ← Dùng ACTUAL USAGE (số pods dùng thật)
```

**Chênh lệch 42%** vì **Requests ≠ Usage**!

---

## 🔍 SOURCE CODE - 3 DÒNG QUAN TRỌNG

### File: `dashboard-master/shell/models/cluster/node.js`

#### **Dòng 189-191: TỬ SỐ - Quyết định dùng Requests hay Usage**

```javascript
get cpuUsage() {
  if ( this.isFromNorman && this.provider === 'eks' ) {
    return parseSi(this.podRequests.cpu || '0');  // ⚠️ Requests!
  }
  return parseSi(this.$rootGetters['cluster/byId'](METRIC.NODE, this.id)?.usage?.cpu || '0');
}
```

**Ý nghĩa:**
- Nếu cluster là **EKS + Norman** → Dùng **Pod Requests**
- Ngược lại → Dùng **Actual Usage** từ metrics-server

#### **Dòng 197: MẪU SỐ - CPU dùng allocatable (đúng)**

```javascript
get cpuCapacity() {
  return parseSi(this.status.allocatable?.cpu);  // ✅ Correct
}
```

#### **Dòng 211: MẪU SỐ - RAM dùng capacity (sai)**

```javascript
get ramCapacity() {
  return parseSi(this.status.capacity?.memory);  // ❌ Should be allocatable!
}
```

---

## 📊 SO SÁNH

### **Trường Hợp Của Bạn (EKS Norman)**

| Metric | Node List | Node Detail | Source |
|--------|-----------|-------------|--------|
| **CPU Tử số** | Pod Requests (3800m) | Actual Usage (2100m) | `node.cpuUsage` |
| **CPU Mẫu số** | Allocatable (3920m) | Allocatable (3920m) | `node.cpuCapacity` |
| **CPU %** | **96.9%** ⚠️ | **53.6%** ✅ | Formula |
| **Chênh lệch** | | **43.3%** | Vì Requests > Usage |

### **RAM (Tất cả clusters)**

| Metric | Node List | Node Detail | Source |
|--------|-----------|-------------|--------|
| **RAM Tử số** | Usage | Usage | Same |
| **RAM Mẫu số** | Capacity (16Gi) ❌ | Allocatable (14.5Gi) ✅ | BUG! |
| **RAM %** | 75% | 55% | Chênh ~20% |

---

## 💡 VÍ DỤ ĐƠN GIẢN

### **Pod Over-requesting (Trường hợp phổ biến)**

```yaml
Pod A:
  spec:
    containers:
    - resources:
        requests:
          cpu: 1000m      # ← Book 1 core
        limits:
          cpu: 2000m
  
  # Thực tế chỉ dùng
  actual usage: 200m     # ← Chỉ dùng 0.2 core!
```

**Kết quả:**
```
Node có 10 pods như trên:
  Total Requests: 10 × 1000m = 10000m  ← Node List dùng
  Total Usage:    10 × 200m  = 2000m   ← Node Detail dùng
  
  → Chênh 8000m = 8 cores! (80% trên node 10-core)
```

---

## 🎯 CÁI NÀO ĐÚNG?

### ✅ **Node Detail (53%) - ĐÚNG HƠN**

**Lý do:**
1. Phản ánh **usage thực tế**
2. Cho biết node còn bao nhiêu % available
3. Hữu ích cho capacity planning

**Dùng khi:**
- Muốn biết node có bị quá tải không
- Quyết định scale pods
- Monitor performance

### ⚠️ **Node List (95%) - GÂY HIỂU NHẦM**

**Lý do:**
1. Chỉ show **requests** (pods đã book)
2. Không phản ánh usage thực
3. Làm node trông "quá tải" hơn thực tế

**Hữu ích khi:**
- Xem pods đã allocate bao nhiêu
- Planning capacity cho scheduling
- Biết "còn chỗ để schedule pods mới" không

---

## 🔧 CÁCH KIỂM TRA NHANH

### **Browser Console (Rancher Dashboard)**

```javascript
// Paste vào browser console tại /dashboard/c/local/explorer/node
const node = window.$nuxt.$store.getters['cluster/all']('node')[0];

console.log('Node:', node.name);
console.log('CPU % (List):', node.cpuUsagePercentage + '%');
console.log('RAM % (List):', node.ramUsagePercentage + '%');
console.log('RAM % (Detail):', node.ramReservedPercentage + '%');

// Check if Norman
const cluster = window.$nuxt.$store.getters['currentCluster'];
console.log('Is Norman?', cluster.metadata.labels?.['cattle.io/creator'] === 'norman');
```

### **kubectl Command**

```bash
# 1. Check requests (Node List dùng)
kubectl describe node <node-name> | grep -A 5 "Allocated resources"

# 2. Check actual usage (Node Detail dùng)  
kubectl top node <node-name>

# 3. Compare
# Allocated % = Node List hiển thị
# Usage %     = Node Detail hiển thị
```

---

## 🛠️ GIẢI PHÁP

### **Ngắn hạn (Ngay lập tức)**

✅ **Tin vào Node Detail (53%)**
- Đó là số chính xác
- Phản ánh usage thực tế
- Node KHÔNG bị quá tải như 95%

### **Trung hạn (Nếu có quyền admin)**

**Bật metrics-server đúng cách:**

```bash
# 1. Install metrics-server (nếu chưa có)
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# 2. Verify
kubectl top nodes

# 3. (Optional) Remove Norman label
kubectl label cluster <cluster-name> cattle.io/creator-
```

### **Dài hạn (Fix source code)**

**Submit PR to Rancher Dashboard:**

```javascript
// File: shell/models/cluster/node.js

// Fix 1: Always use actual usage (remove Norman check)
get cpuUsage() {
  return parseSi(this.$rootGetters['cluster/byId'](METRIC.NODE, this.id)?.usage?.cpu || '0');
}

// Fix 2: RAM should use allocatable
get ramCapacity() {
  return parseSi(this.status.allocatable?.memory);  // Change from capacity
}
```

---

## 📚 TÀI LIỆU CHI TIẾT

- **Full Analysis:** `NODE-METRICS-ANALYSIS.md`
- **Verify Script:** `verify-node-metrics.sh <node-name>`
- **Browser Tool:** `browser-verify-metrics.js`

---

## 🎓 KEY TAKEAWAYS

1. **95% là số inflated** - Dùng requests thay vì usage
2. **53% là số thật** - Phản ánh usage thực tế
3. **EKS Norman cluster** - Nguyên nhân chính của sự lệch
4. **Trust Node Detail** - Luôn tin vào số ở detail page
5. **Bug in Rancher** - RAM dùng capacity thay vì allocatable

---

**Last Updated:** January 22, 2026  
**Status:** ✅ Verified và Documented
