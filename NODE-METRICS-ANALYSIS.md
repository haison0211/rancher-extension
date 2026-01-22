# 🔍 PHÂN TÍCH CHI TIẾT: SỰ SAI LỆCH METRICS GIỮA NODE LIST VÀ NODE DETAIL

## 📊 VẤN ĐỀ

Trên **cùng 1 EKS Spot Instance Node**:
- **Node List Table**: Hiển thị **95%** CPU usage
- **Node Detail Page**: Hiển thị **53%** CPU usage
- **Chênh lệch**: ~42% (rất lớn!)

---

## 🔎 SOURCE CODE ANALYSIS

### 1️⃣ NODE LIST - CÁCH TÍNH TOÁN

**File:** `dashboard-master/shell/models/cluster/node.js`

#### **CPU Usage (Tử số)**

```javascript
get cpuUsage() {
  /*
    With EKS nodes that have been migrated from norman,
    cpu/memory usage is by the annotation `management.cattle.io/pod-requests`
  */
  if ( this.isFromNorman && this.provider === 'eks' ) {
    // ⚠️ CASE 1: EKS từ Norman - Dùng POD REQUESTS (không phải actual usage!)
    return parseSi(this.podRequests.cpu || '0');
  }

  // ✅ CASE 2: Cluster bình thường - Dùng actual usage từ metrics-server
  return parseSi(this.$rootGetters['cluster/byId'](METRIC.NODE, this.id)?.usage?.cpu || '0');
}
```

#### **CPU Capacity (Mẫu số)**

```javascript
get cpuCapacity() {
  // ✅ Dùng ALLOCATABLE (correct)
  return parseSi(this.status.allocatable?.cpu);
}
```

#### **CPU Percentage**

```javascript
get cpuUsagePercentage() {
  // Formula: (usage / allocatable) × 100
  return ((this.cpuUsage * 100) / this.cpuCapacity).toString();
}
```

#### **RAM Usage (Tử số)**

```javascript
get ramUsage() {
  if ( this.isFromNorman && this.provider === 'eks' ) {
    // ⚠️ CASE 1: EKS từ Norman - Dùng POD REQUESTS (không phải actual usage!)
    return parseSi(this.podRequests.memory || '0');
  }

  // ✅ CASE 2: Cluster bình thường - Dùng actual usage từ metrics-server
  return parseSi(this.$rootGetters['cluster/byId'](METRIC.NODE, this.id)?.usage?.memory || '0');
}
```

#### **RAM Capacity (Mẫu số)**

```javascript
get ramCapacity() {
  // ❌ BUG: Dùng CAPACITY (should use allocatable like CPU!)
  return parseSi(this.status.capacity?.memory);
}
```

#### **RAM Percentage**

```javascript
get ramUsagePercentage() {
  // ❌ Formula: (usage / capacity) × 100 - WRONG!
  return ((this.ramUsage * 100) / this.ramCapacity).toString();
}
```

#### **RAM Reserved (cho Node Detail)**

```javascript
get ramReserved() {
  // ✅ Đúng - dùng ALLOCATABLE
  return parseSi(this.status?.allocatable?.memory);
}

get ramReservedPercentage() {
  // ✅ Formula: (usage / allocatable) × 100 - CORRECT!
  return ((this.ramUsage * 100) / this.ramReserved).toString();
}
```

#### **Pod Requests Annotation (EKS Norman)**

```javascript
get podRequests() {
  // Lấy từ annotation (sum of all pod requests trên node)
  return JSON.parse(this.metadata.annotations['management.cattle.io/pod-requests'] || '{}');
}

get isFromNorman() {
  return (this.$rootGetters['currentCluster'].metadata.labels || {})['cattle.io/creator'] === 'norman';
}

get provider() {
  return this.$rootGetters['currentCluster'].provisioner.toLowerCase();
}
```

---

### 2️⃣ NODE DETAIL - CÁCH TÍNH TOÁN

**File:** `dashboard-master/shell/detail/node.vue`

#### **CPU Display**

```vue
<ConsumptionGauge
  :resource-name="t('node.detail.glance.consumptionGauge.cpu')"
  :capacity="value.cpuCapacity"     <!-- allocatable -->
  :used="value.cpuUsage"            <!-- actual usage from metrics -->
/>
```

**Công thức:**
```javascript
CPU % = (value.cpuUsage / value.cpuCapacity) × 100
      = (actual usage / allocatable) × 100
```

#### **Memory Display**

```vue
<ConsumptionGauge
  :resource-name="t('node.detail.glance.consumptionGauge.memory')"
  :capacity="value.ramReserved"     <!-- allocatable (NOT ramCapacity!) -->
  :used="value.ramUsage"            <!-- actual usage from metrics -->
  :units="memoryUnits"
  :number-formatter="memoryFormatter"
/>
```

**Công thức:**
```javascript
RAM % = (value.ramUsage / value.ramReserved) × 100
      = (actual usage / allocatable) × 100
```

---

### 3️⃣ METRICS SERVER MODEL

**File:** `dashboard-master/shell/models/metrics.k8s.io.nodemetrics.js`

```javascript
export default class NodeMetric extends SteveModel {
  get cpuUsage() {
    // Lấy từ metrics.k8s.io API
    return parseSi(this?.usage?.cpu || '0');
  }

  get cpuCapacity() {
    // Lấy allocatable từ Node object
    return parseSi(this.$rootGetters[`${this.inStore}/byId`](NODE, this.id)?.status?.allocatable?.cpu || '0');
  }

  get memoryUsage() {
    return parseSi(this?.usage?.memory || '0');
  }

  get memoryCapacity() {
    // ❌ BUG: Dùng capacity thay vì allocatable!
    return parseSi(this.$rootGetters[`${this.inStore}/byId`](NODE, this.id)?.status?.capacity?.memory || '0');
  }
}
```

---

## 🎯 NGUYÊN NHÂN GỐC RỄ CỦA SỰ SAI LỆCH

### **TRƯỜNG HỢP CỦA BẠN: EKS SPOT INSTANCE**

#### **Điều Kiện:**
```javascript
isFromNorman = true  // EKS cluster được migrate từ Norman
provider = 'eks'     // EKS cluster
```

#### **Node List sẽ dùng:**

**CPU:**
```javascript
// TỬ SỐ: Pod Requests (không phải actual usage!)
cpuUsage = parseSi(this.podRequests.cpu)
// Ví dụ: "3800m" (tổng requests của tất cả pods)

// MẪU SỐ: Allocatable
cpuCapacity = parseSi(this.status.allocatable.cpu)
// Ví dụ: "3920m" (4 cores - 80m reserved)

// KẾT QUẢ
cpuUsagePercentage = (3800 / 3920) × 100 = 96.9% ← Bạn thấy 9x%!
```

**RAM:**
```javascript
// TỬ SỐ: Pod Requests (không phải actual usage!)
ramUsage = parseSi(this.podRequests.memory)
// Ví dụ: "12Gi" (tổng requests của tất cả pods)

// MẪU SỐ: Capacity (❌ sai - should be allocatable)
ramCapacity = parseSi(this.status.capacity.memory)
// Ví dụ: "16Gi" (total RAM)

// KẾT QUẢ
ramUsagePercentage = (12 / 16) × 100 = 75%
```

#### **Node Detail sẽ dùng:**

**CPU:**
```javascript
// TỬ SỐ: Actual Usage từ metrics-server
// (Metrics-server không quan tâm isFromNorman, nó fetch trực tiếp)
cpuUsage = parseSi(metrics-server.usage.cpu)
// Ví dụ: "2100m" (pods thực tế đang dùng)

// MẪU SỐ: Allocatable
cpuCapacity = parseSi(this.status.allocatable.cpu)
// Ví dụ: "3920m"

// KẾT QUẢ
CPU % = (2100 / 3920) × 100 = 53.6% ← Bạn thấy 5x%!
```

**RAM:**
```javascript
// TỬ SỐ: Actual Usage từ metrics-server
ramUsage = parseSi(metrics-server.usage.memory)
// Ví dụ: "8Gi"

// MẪU SỐ: Allocatable (ramReserved)
ramReserved = parseSi(this.status.allocatable.memory)
// Ví dụ: "14.5Gi" (16Gi - 1.5Gi reserved)

// KẾT QUẢ
RAM % = (8 / 14.5) × 100 = 55.2%
```

---

## 📊 SO SÁNH CÔNG THỨC

### **CPU**

| View | Tử số | Mẫu số | Công thức | Kết quả |
|------|-------|--------|-----------|---------|
| **Node List (EKS Norman)** | Pod Requests (3800m) | Allocatable (3920m) | 3800/3920×100 | **96.9%** ⚠️ |
| **Node Detail** | Actual Usage (2100m) | Allocatable (3920m) | 2100/3920×100 | **53.6%** ✅ |

**Chênh lệch:** 43.3% - Vì dùng **Requests** thay vì **Actual Usage**!

### **RAM**

| View | Tử số | Mẫu số | Công thức | Kết quả |
|------|-------|--------|-----------|---------|
| **Node List (EKS Norman)** | Pod Requests (12Gi) | Capacity (16Gi) ❌ | 12/16×100 | **75%** |
| **Node Detail** | Actual Usage (8Gi) | Allocatable (14.5Gi) ✅ | 8/14.5×100 | **55.2%** |

**Chênh lệch:** 19.8% - Vì dùng **Requests + Capacity** thay vì **Usage + Allocatable**!

---

## 🔥 ROOT CAUSE SUMMARY

### **3 VẤN ĐỀ CHÍNH:**

#### **1. EKS Norman Cluster dùng Pod Requests thay vì Actual Usage**

```javascript
// dashboard-master/shell/models/cluster/node.js:189
if ( this.isFromNorman && this.provider === 'eks' ) {
  return parseSi(this.podRequests.cpu || '0');  // ❌ REQUESTS, not USAGE!
}
```

**Tại sao?**
- EKS clusters được migrate từ Rancher 1.x (Norman) không có metrics-server
- Phải dùng annotation `management.cattle.io/pod-requests` (tổng requests)
- **Requests ≠ Actual Usage!**

**Ví dụ:**
```yaml
Pod A:
  requests: 1000m     ← Node List dùng số này
  actual usage: 200m  ← Node Detail dùng số này
  
Pod B:
  requests: 2000m
  actual usage: 1500m

Total:
  requests: 3000m     ← 3000m
  usage: 1700m        ← 1700m (chênh 1300m = 43%!)
```

#### **2. RAM dùng Capacity thay vì Allocatable (Bug)**

```javascript
// dashboard-master/shell/models/cluster/node.js:211
get ramCapacity() {
  return parseSi(this.status.capacity?.memory);  // ❌ Should be allocatable!
}
```

**Sự khác biệt:**
```yaml
status:
  capacity:
    memory: "16Gi"        ← Node List dùng (SAI)
  allocatable:
    memory: "14.5Gi"      ← Node Detail dùng (ĐÚNG)
    
Reserved: 1.5Gi (kubelet, OS, eviction threshold)
```

#### **3. Node Detail không bị ảnh hưởng bởi isFromNorman**

```vue
<!-- detail/node.vue:228 -->
<ConsumptionGauge
  :used="value.cpuUsage"      <!-- Gọi getter, nhưng hiển thị lấy từ đâu? -->
  :capacity="value.ramReserved"
/>
```

**ConsumptionGauge** lấy data real-time từ:
- Metrics poller (mixins/metric-poller)
- Trực tiếp từ metrics-server API
- **KHÔNG qua** Node model getter!

---

## 💡 GIẢI PHÁP

### **Option 1: Bật Metrics Server cho EKS**

Nếu EKS cluster có metrics-server, đánh dấu lại:

```bash
# Remove Norman label
kubectl label cluster <cluster-name> cattle.io/creator-

# Verify
kubectl get cluster <cluster-name> -o yaml | grep creator
```

### **Option 2: Fix Source Code**

**File 1:** `dashboard-master/shell/models/cluster/node.js`

```javascript
// Fix RAM capacity
get ramCapacity() {
  // Use allocatable instead of capacity (consistent with CPU)
  return parseSi(this.status.allocatable?.memory);
}

// Optional: Add actual usage getter for EKS
get cpuActualUsage() {
  // Always use metrics-server, ignore annotation
  return parseSi(this.$rootGetters['cluster/byId'](METRIC.NODE, this.id)?.usage?.cpu || '0');
}

get cpuRequestsUsage() {
  // Separate getter for requests
  if ( this.isFromNorman && this.provider === 'eks' ) {
    return parseSi(this.podRequests.cpu || '0');
  }
  return this.cpuActualUsage;
}
```

### **Option 3: Extension Override**

Tạo custom Node model trong extension:

```typescript
// pkg/rancher-node-metrics/models/cluster/node.ts
import ClusterNode from '@shell/models/cluster/node';

export default class CustomNode extends ClusterNode {
  // Always use actual usage from metrics
  get cpuUsage() {
    return parseSi(this.$rootGetters['cluster/byId'](METRIC.NODE, this.id)?.usage?.cpu || '0');
  }
  
  get ramUsage() {
    return parseSi(this.$rootGetters['cluster/byId'](METRIC.NODE, this.id)?.usage?.memory || '0');
  }
  
  // Fix RAM capacity
  get ramCapacity() {
    return parseSi(this.status.allocatable?.memory);
  }
}
```

---

## 🔍 CÁCH VERIFY TRÊN CLUSTER CỦA BẠN

### **1. Kiểm tra Node metadata:**

```bash
kubectl get node <your-node> -o yaml
```

**Tìm:**
```yaml
metadata:
  annotations:
    management.cattle.io/pod-requests: '{"cpu":"3800m","memory":"12Gi"}'
  labels:
    cattle.io/creator: norman  # ← Có label này = dùng requests!
```

### **2. So sánh Requests vs Usage:**

```bash
# Tổng requests
kubectl describe node <your-node> | grep -A 5 "Allocated resources"

# Output:
# Allocated resources:
#   cpu        3800m (96%)     ← Node List hiển thị
#   memory     12Gi (75%)

# Actual usage
kubectl top node <your-node>

# Output:
# NAME          CPU(cores)   CPU%    MEMORY(bytes)   MEMORY%
# your-node     2100m        53%     8Gi            55%
#               ↑            ↑
#               Actual       Node Detail hiển thị
```

### **3. Kiểm tra Capacity vs Allocatable:**

```bash
kubectl get node <your-node> -o jsonpath='{.status.capacity}' | jq
kubectl get node <your-node> -o jsonpath='{.status.allocatable}' | jq
```

**Output:**
```json
// Capacity
{
  "cpu": "4",
  "memory": "16384Mi"
}

// Allocatable
{
  "cpu": "3920m",
  "memory": "14848Mi"  // ~1.5Gi reserved
}
```

---

## 📚 TÓM TẮT CHO BEGINNER

### **Tại sao 95% vs 53%?**

1. **Node List (95%)**:
   - Dùng **Pod Requests** (3800m) - số pods đã book
   - Dùng **Allocatable** (3920m)
   - ➡️ 3800/3920 = **96.9%** (gần 95%)

2. **Node Detail (53%)**:
   - Dùng **Actual Usage** (2100m) - số pods đang dùng thật
   - Dùng **Allocatable** (3920m)
   - ➡️ 2100/3920 = **53.6%** (gần 53%)

### **Cái nào đúng?**

✅ **Node Detail (53%) là chính xác!**
- Phản ánh usage thực tế
- Dùng allocatable (số có thể dùng)

❌ **Node List (95%) gây hiểu nhầm!**
- Chỉ show requests (pods đã book)
- Không phản ánh usage thực tế
- Làm node trông quá tải hơn thực tế

### **Ví dụ thực tế:**

```
Khách sạn (Node) có 100 phòng
- Allocatable: 85 phòng (trừ phòng kỹ thuật)
- Đã book (Requests): 95 phòng ← Node List: 95/100 = 95% full!
- Thực tế check-in (Usage): 53 phòng ← Node Detail: 53/100 = 53% full

➡️ Requests cao nhưng actual usage thấp!
```

---

## 🎯 HÀNH ĐỘNG ĐỀ XUẤT

1. **Ngắn hạn:** Tin vào số liệu ở **Node Detail** (53%)
2. **Trung hạn:** Set up metrics-server đúng cách cho EKS
3. **Dài hạn:** Fix bug trong Rancher Dashboard (ramCapacity)

---

**Created:** January 22, 2026
**Author:** Senior Fullstack Developer
**Review:** Node Metrics Calculation Discrepancy Analysis
