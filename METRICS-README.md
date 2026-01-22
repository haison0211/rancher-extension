# 📊 Node Metrics Discrepancy Analysis

Phân tích chi tiết nguyên nhân sự khác biệt giữa metrics hiển thị trên **Node List** và **Node Detail** trong Rancher Dashboard.

## 🎯 Vấn Đề

Cùng 1 node nhưng hiển thị CPU/RAM usage khác nhau:
- **Node List Table**: 95% CPU, 75% RAM
- **Node Detail Page**: 53% CPU, 55% RAM

**Chênh lệch lớn và gây nhầm lẫn!**

---

## 📁 Files

| File | Mô tả | Dùng cho |
|------|-------|----------|
| [`METRICS-SUMMARY.md`](./METRICS-SUMMARY.md) | 📄 Tóm tắt ngắn gọn | Đọc nhanh (5 phút) |
| [`NODE-METRICS-ANALYSIS.md`](./NODE-METRICS-ANALYSIS.md) | 📚 Phân tích chi tiết | Hiểu sâu về source code |
| [`verify-node-metrics.sh`](./verify-node-metrics.sh) | 🔍 Script kiểm tra | Chạy trên terminal |
| [`browser-verify-metrics.js`](./browser-verify-metrics.js) | 🌐 Browser console tool | Debug trên Dashboard |

---

## 🚀 Quick Start

### 1. Đọc Tóm Tắt (5 phút)

```bash
cat METRICS-SUMMARY.md
```

**Bạn sẽ hiểu:**
- ✅ Tại sao có sự chênh lệch
- ✅ Tin vào số nào
- ✅ Cách verify nhanh

### 2. Verify Trên Cluster (2 phút)

```bash
# Make executable
chmod +x verify-node-metrics.sh

# Run on your node
./verify-node-metrics.sh <your-node-name>

# Example:
./verify-node-metrics.sh ip-10-1-11-17.ap-southeast-1.compute.internal
```

**Output:**
```
🔍 NODE METRICS VERIFICATION TOOL
==================================

1️⃣  CHECKING NORMAN ANNOTATION
⚠️  Norman cluster detected!
   Will use Pod Requests instead of Actual Usage

2️⃣  CAPACITY vs ALLOCATABLE
CPU:
  Capacity:    4
  Allocatable: 3920m
  Reserved:    80m (~2%)

3️⃣  ALLOCATED RESOURCES (Pod Requests)
  cpu        3800m (96%)     ← Node List shows this
  memory     12Gi (75%)

4️⃣  ACTUAL USAGE (from metrics-server)
NAME          CPU(cores)   CPU%    MEMORY
ip-10-1-11-17 2100m        53%     8Gi
              ↑            ↑
              Usage        Node Detail shows this

✅ Analysis complete!
```

### 3. Debug Trên Dashboard (2 phút)

1. Mở Rancher Dashboard
2. Navigate to: `/dashboard/c/local/explorer/node`
3. Press `F12` (DevTools)
4. Copy nội dung `browser-verify-metrics.js`
5. Paste vào Console tab
6. Press Enter

**Kết quả:**
```
🔍 NODE METRICS VERIFICATION TOOL
==================================

📊 Analyzing Node: ip-10-1-11-17

1️⃣  CLUSTER INFO
Provider: eks
Is Norman Cluster: true
⚠️  WARNING: EKS Norman cluster detected!

3️⃣  USAGE VALUES
CPU Usage (from getter):
  node.cpuUsage: 3800000000
  ⚠️  Source: Pod Requests annotation

5️⃣  DISCREPANCY ANALYSIS
RAM Percentage:
  Node List:   75.00% (uses capacity)
  Node Detail: 55.17% (uses allocatable)
  Difference:  19.83%
  ⚠️  SIGNIFICANT DISCREPANCY!

✅ Verification complete!
```

---

## 💡 TL;DR - Câu Trả Lời Nhanh

### ❓ Tại sao 95% vs 53%?

**Node List (95%)**:
- Dùng **Pod Requests** (số pods đã book)
- Vì cluster là EKS migrated từ Rancher 1.x

**Node Detail (53%)**:
- Dùng **Actual Usage** (số pods đang dùng thật)
- Lấy từ metrics-server

**➡️ Pods book nhiều nhưng dùng ít → Chênh lệch lớn!**

### ✅ Tin vào số nào?

**Node Detail (53%)** - Đây là số chính xác!
- Phản ánh usage thực tế
- Node KHÔNG quá tải như 95%
- Dùng cho monitoring và scaling

### 🔧 Làm sao để fix?

**Ngắn hạn:** Tin vào Node Detail

**Dài hạn:** 
1. Ensure metrics-server hoạt động
2. Remove Norman label (nếu có quyền)
3. Submit PR fix Rancher source code

---

## 🔍 Source Code Analysis

### Tìm Thấy Ở Đâu?

#### **File 1: Node Model**
```
dashboard-master/shell/models/cluster/node.js
```

**Dòng 189-191:** Quyết định dùng Requests hay Usage
```javascript
if ( this.isFromNorman && this.provider === 'eks' ) {
  return parseSi(this.podRequests.cpu || '0');  // ← Nguyên nhân!
}
```

**Dòng 211:** RAM bug (dùng capacity thay vì allocatable)
```javascript
get ramCapacity() {
  return parseSi(this.status.capacity?.memory);  // ← Bug
}
```

#### **File 2: Node Detail Component**
```
dashboard-master/shell/detail/node.vue
```

**Dòng 228-235:** Dùng ramReserved (allocatable)
```vue
<ConsumptionGauge
  :capacity="value.ramReserved"  <!-- allocatable -->
  :used="value.ramUsage"
/>
```

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Kubernetes Cluster (EKS Spot Instance)                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Node Status:                                            │
│  ├─ capacity.cpu: "4"                                   │
│  ├─ allocatable.cpu: "3920m"                            │
│  ├─ capacity.memory: "16Gi"                             │
│  └─ allocatable.memory: "14.5Gi"                        │
│                                                          │
│  Annotation (Norman):                                    │
│  └─ pod-requests: {cpu: "3800m", memory: "12Gi"}       │
│                                                          │
│  Metrics Server:                                         │
│  └─ usage: {cpu: "2100m", memory: "8Gi"}               │
│                                                          │
└─────────────────────────────────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            │                             │
            ▼                             ▼
┌────────────────────────┐    ┌────────────────────────┐
│   Node List (Table)    │    │   Node Detail (Page)   │
├────────────────────────┤    ├────────────────────────┤
│                        │    │                        │
│ cpuUsage:              │    │ cpuUsage:              │
│  = podRequests.cpu ⚠️  │    │  = metrics.usage.cpu ✅│
│  = 3800m               │    │  = 2100m               │
│                        │    │                        │
│ cpuCapacity:           │    │ cpuCapacity:           │
│  = allocatable.cpu ✅  │    │  = allocatable.cpu ✅  │
│  = 3920m               │    │  = 3920m               │
│                        │    │                        │
│ CPU %:                 │    │ CPU %:                 │
│  = 3800/3920 × 100     │    │  = 2100/3920 × 100     │
│  = 96.9% 📊            │    │  = 53.6% 📊            │
│                        │    │                        │
│ ramCapacity:           │    │ ramReserved:           │
│  = capacity.memory ❌  │    │  = allocatable.memory ✅│
│  = 16Gi                │    │  = 14.5Gi              │
│                        │    │                        │
│ RAM %:                 │    │ RAM %:                 │
│  = 12/16 × 100 ❌      │    │  = 8/14.5 × 100 ✅     │
│  = 75% 📊              │    │  = 55.2% 📊            │
│                        │    │                        │
└────────────────────────┘    └────────────────────────┘
```

---

## 🐛 Bugs Identified

### Bug #1: EKS Norman Uses Requests Instead of Usage

**Location:** `shell/models/cluster/node.js:189`

```javascript
// BEFORE (Current - Bug)
get cpuUsage() {
  if ( this.isFromNorman && this.provider === 'eks' ) {
    return parseSi(this.podRequests.cpu || '0');  // ❌ Uses requests
  }
  return parseSi(this.$rootGetters['cluster/byId'](METRIC.NODE, this.id)?.usage?.cpu || '0');
}

// AFTER (Proposed Fix)
get cpuUsage() {
  // Always use actual usage from metrics-server
  return parseSi(this.$rootGetters['cluster/byId'](METRIC.NODE, this.id)?.usage?.cpu || '0');
}
```

### Bug #2: RAM Uses Capacity Instead of Allocatable

**Location:** `shell/models/cluster/node.js:211`

```javascript
// BEFORE (Current - Bug)
get ramCapacity() {
  return parseSi(this.status.capacity?.memory);  // ❌ Uses capacity
}

// AFTER (Proposed Fix)
get ramCapacity() {
  return parseSi(this.status.allocatable?.memory);  // ✅ Use allocatable (like CPU)
}
```

---

## 🎯 Recommendations

### For Users

1. ✅ **Trust Node Detail metrics** - Chính xác hơn
2. ⚠️ **Node List có thể inflated** - Đặc biệt với EKS Norman clusters
3. 📊 **Dùng `kubectl top nodes`** - Để verify actual usage

### For Developers

1. 🔧 **Fix RAM capacity bug** - Dùng allocatable thay vì capacity
2. 🔧 **Remove Norman special case** - Luôn dùng metrics-server
3. 📝 **Add warning banner** - Khi hiển thị requests thay vì usage
4. 🧪 **Add unit tests** - Cho metrics calculations

---

## 📚 Related Issues

- [Rancher #xxxxx] - Node List shows inflated metrics for EKS Norman clusters
- [Rancher #xxxxx] - Inconsistent RAM percentage calculation
- [Kubernetes #xxxxx] - Difference between capacity and allocatable

---

## 🤝 Contributing

Nếu bạn muốn contribute fix:

1. Fork Rancher Dashboard repo
2. Apply fixes từ `NODE-METRICS-ANALYSIS.md`
3. Add tests
4. Submit PR với reference đến analysis này

---

## 📞 Support

- **Full Analysis**: See `NODE-METRICS-ANALYSIS.md`
- **Quick Summary**: See `METRICS-SUMMARY.md`
- **Issues**: Open issue với tag `metrics` và `node`

---

**Created:** January 22, 2026  
**Last Updated:** January 22, 2026  
**Status:** ✅ Verified và Documented  
**Author:** Senior Fullstack Developer
