# 🏗️ Pod Metrics Extension - Architecture Deep Dive

## 📊 Tổng Quan

Extension này thêm cột CPU và RAM metrics vào 2 trang trong Rancher Dashboard:
1. **Pod Explorer** (`/c/local/explorer/pod`)
2. **Node Detail - Pods Tab** (`/c/local/explorer/node/:name#pods`)

## 🔄 Auto-Refresh Strategy

### ❓ Tại sao không dùng mechanism của Rancher?

**Rancher dùng WebSocket, không phải HTTP polling!**

```javascript
// Rancher ResourceTable Architecture
ResourceTable.vue
  ├── ResourceTableWatch mixin
  │   ├── WebSocket subscribe to resource type
  │   ├── Listen for resource.change events  
  │   └── Real-time updates khi có thay đổi
  └── NO HTTP polling interval!
```

**Vấn đề**: Metrics API **không hỗ trợ WebSocket watch**
```bash
✅ /api/v1/pods              → Hỗ trợ watch qua Steve WebSocket
❌ /apis/metrics.k8s.io/v1beta1/pods → KHÔNG hỗ trợ watch
```

### 💡 Hybrid Approach - Best of Both Worlds

Chúng ta sử dụng **2-tier refresh strategy**:

```typescript
// Tier 1: Listen to Pod WebSocket events
this.$store.watch(
  (state, getters) => {
    const pods = getters['cluster/all']('pod');
    return pods?.length || 0;
  },
  (newVal, oldVal) => {
    if (newVal !== oldVal) {
      this.loadMetrics(); // Refresh metrics khi Pod thay đổi
    }
  }
);

// Tier 2: Fallback polling for metrics-only changes
setInterval(() => {
  this.loadMetrics();
}, 10000); // 10s
```

### 🎯 Tại sao Hybrid tốt hơn Pure Polling?

| Scenario | Pure Polling (10s) | Hybrid Approach |
|----------|-------------------|-----------------|
| Pod mới được tạo | ⏰ Đợi tối đa 10s | ✅ Ngay lập tức (WebSocket) |
| Pod bị xóa | ⏰ Đợi tối đa 10s | ✅ Ngay lập tức (WebSocket) |
| Metrics thay đổi (CPU/RAM tăng) | ⏰ 10s | ⏰ 10s (polling) |
| User inactive (tab hidden) | ❌ Vẫn poll 10s | ✅ Giảm xuống 60s |
| Bandwidth usage | 🔴 Cao | 🟢 Thấp hơn |

## 🚦 Request Deduplication

### Vấn đề: Duplicate Requests

Trong 20 giây có thể có **10 requests** vì:
1. Component mount → fetch ngay
2. Polling interval → fetch mỗi 10s
3. Visibility change → fetch lại
4. Store watch trigger → fetch thêm

**Kết quả**: 10 requests / 20s = quá nhiều!

### Giải pháp: Time-based Deduplication

```typescript
async loadMetrics() {
  const now = Date.now();
  
  // ✋ Block requests within 2 seconds
  if (this.metricsLoading || (now - this.lastFetchTime < 2000)) {
    return; // Skip this request
  }
  
  this.lastFetchTime = now;
  // ... proceed with fetch
}
```

**Kết quả**: 
- ❌ Before: 10 requests / 20s
- ✅ After: 2-3 requests / 20s (1 initial + 1-2 từ polling)

## 📐 Architecture Comparison

### Pod Explorer - Extending Approach

```
Rancher ResourceTable
      ↓
  [EXTENDS]
      ↓
Our Pod List Component
  ├── Inject headers (CPU, RAM)
  ├── Custom cell templates
  ├── Store watch for Pod changes
  ├── Polling for metrics
  └── Adaptive refresh (10s → 60s)
```

**Pros**:
- ✅ Tận dụng built-in ResourceTable features
- ✅ Code ngắn gọn (~270 lines)
- ✅ Auto-update khi Rancher update ResourceTable

**Cons**:
- ⚠️ Phụ thuộc vào ResourceTable API stability

### Node Detail - Cloning Approach

```
Rancher node.vue
      ↓
   [CLONE]
      ↓
Our node.vue (~487 lines)
  ├── Copy toàn bộ UI logic
  ├── Inject metrics state
  ├── Modify podTableHeaders computed
  ├── Add metrics cell templates
  └── Polling for metrics (10s)
```

**Pros**:
- ✅ Full control over component

**Cons**:
- ❌ Code dài, phức tạp
- ❌ Không tự động update khi Rancher thay đổi
- ❌ Khó maintain

## 🔍 Request Flow Diagram

```
User opens Pod Explorer
         ↓
Component mounted
         ↓
    ┌────┴────┐
    ↓         ↓
[Store Watch] [Polling]
    ↓         ↓
    │    setInterval(10s)
    │         ↓
Pod WebSocket ├──> loadMetrics()
event         │         ↓
    ↓         │    Check dedup
    └────┬────┘    (2s window)
         ↓              ↓
   Fetch /k8s/clusters/local/
   apis/metrics.k8s.io/v1beta1/pods
         ↓
   Update metricsMap
         ↓
   Template re-renders
   with new metrics
```

## 🎛️ Adaptive Polling

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Tab inactive → save resources
    this.startPolling(60000); // 60s
  } else {
    // Tab active → normal speed
    this.startPolling(10000); // 10s
  }
});
```

**Benefits**:
- 🌿 Tiết kiệm bandwidth khi user không nhìn
- 🔋 Giảm CPU usage trên browser
- 🌐 Giảm load lên Rancher server

## 📊 Performance Metrics

### Expected Request Rate

| Tab State | Interval | Requests/min |
|-----------|----------|--------------|
| Active | 10s | ~6 requests |
| Inactive | 60s | ~1 request |
| With dedup | Varies | 3-4 requests |

### Memory Usage

- Metrics Map size: ~1-2 KB per pod
- 100 pods: ~100-200 KB
- Minimal overhead!

## 🚀 Future Improvements

### Option 1: Rancher Native Metrics Support
Nếu Rancher thêm metrics vào WebSocket watch:
```typescript
// Future code (không work hiện tại)
this.$store.watch('pod-metrics', (changes) => {
  this.updateMetrics(changes);
});
```

### Option 2: Shared Metrics Service
Tránh duplicate fetching giữa Pod Explorer và Node Detail:
```typescript
// Singleton metrics service
const MetricsService = {
  cache: new Map(),
  lastFetch: 0,
  async getMetrics() {
    // Shared cache across components
  }
};
```

### Option 3: Server-Side Aggregation
Backend endpoint merge Pod data + Metrics:
```
GET /api/v1/pods-with-metrics
→ Trả về Pod info + metrics trong 1 request
```

## 📝 Summary

1. **WebSocket cho Pods**: Real-time updates khi Pod thay đổi
2. **Polling cho Metrics**: Required vì metrics.k8s.io không support watch
3. **Deduplication**: Prevent spam requests
4. **Adaptive Refresh**: Intelligent throttling dựa trên user activity
5. **Hybrid = Best Practice**: Cân bằng giữa performance và UX

