# 🎯 Pod Metrics Extension - Hướng dẫn Đầy đủ

## ✅ Đã Hoàn thành

Extension **rancher-pod-metrics** đã được tạo thành công với đầy đủ tính năng:

### Features
- ✅ Thêm cột CPU (vCPU) vào Pod Explorer
- ✅ Thêm cột RAM (MiB/GiB) vào Pod Explorer  
- ✅ Auto-refresh metrics mỗi 3 giây
- ✅ Sort theo CPU/RAM (click vào header)
- ✅ Error handling (metrics-server unavailable)
- ✅ Loading states (spinner khi đang fetch)
- ✅ TypeScript + Vue3
- ✅ Build thành công

---

## 📁 Cấu trúc Thư mục

```
my-first-extension/
├── pkg/
│   ├── my-first-extension/         # Extension cũ (Hello World)
│   └── rancher-pod-metrics/        # ← Extension mới
│       ├── index.ts                # Entry point
│       ├── package.json            # Metadata
│       ├── README.md               # Documentation
│       ├── types/
│       │   └── pod-metrics.ts      # TypeScript definitions
│       ├── utils/
│       │   └── metrics.ts          # Metrics logic
│       └── list/
│           └── pod.vue             # Custom Pod list component
├── dist-pkg/
│   └── rancher-pod-metrics-1.0.0/  # Built extension
│       ├── rancher-pod-metrics-1.0.0.umd.min.js
│       └── package.json
└── package.json                    # Root config
```

---

## 🔧 Kiến trúc & API Rancher Sử dụng

### 1. **Extension Registration** (`index.ts`)

```typescript
plugin.register('list', 'pod', () => import('./list/pod.vue'));
```

**Giải thích:**
- `register('list', 'pod', ...)`: Override Pod list component
- Rancher Dashboard sẽ load custom component thay vì default
- Auto-apply cho route: `/dashboard/c/:cluster/explorer/pod`

### 2. **Metrics Fetching** (`utils/metrics.ts`)

**API Endpoint:**
```
GET /k8s/clusters/{clusterId}/apis/metrics.k8s.io/v1beta1/pods
```

**Data Flow:**
```
metrics.k8s.io API → Parse → Map<namespace/name, ParsedMetrics> → Enhance Rows
```

**Functions:**
- `parseCPU()`: "123m" → 123 millicores
- `parseMemory()`: "256Mi" → 256 MiB
- `formatCPU()`: 500 millicores → "0.5 vCPU"
- `formatMemory()`: 1536 MiB → "1.5 GiB"
- `fetchPodMetrics()`: Fetch và parse tất cả pod metrics

### 3. **Table Extension** (`list/pod.vue`)

**Mechanism:**
```typescript
// Computed property tạo headers mới
headers() {
  const baseHeaders = this.defaultHeaders;
  const metricsHeaders = [
    { name: 'cpu', sort: ['metrics.cpu'], ... },
    { name: 'memory', sort: ['metrics.memory'], ... }
  ];
  return [...baseHeaders, ...metricsHeaders];
}

// Enhance rows với metrics data
enhancedRows() {
  return rows.map(row => ({
    ...row,
    metrics: this.metricsMap.get(key)
  }));
}
```

**Sorting:**
- Rancher `ResourceTable` tự động handle sort
- Chỉ cần khai báo `sort: ['metrics.cpu']` trong header
- Client-side sort, không cần API call

### 4. **Auto-refresh Mechanism**

```typescript
mounted() {
  this.loadMetrics();  // Initial load
  this.refreshInterval = setInterval(() => {
    this.loadMetrics();
  }, 3000);  // Refresh every 3s
}

beforeUnmount() {
  clearInterval(this.refreshInterval);  // Cleanup
}
```

---

## 🚀 Cách Test Extension

### Option 1: Dev Mode (Khuyến nghị)

```bash
cd /Users/admin/Documents/rancher-extension/my-first-extension

# Start dev server
API=https://rancher.selless.dev yarn dev
```

**Truy cập:**
- URL: `https://localhost:8005/dashboard/c/local/explorer/pod`
- Login với admin account
- Extension sẽ tự động load (hot-reload enabled)

**Verify:**
- Bảng Pod có 2 cột mới: **CPU** và **RAM**
- Metrics refresh mỗi 3 giây
- Click vào header CPU/RAM để test sorting
- Hover vào số liệu để xem tooltip (exact millicores/MiB)

### Option 2: Build & Developer Load

```bash
# 1. Build extension
yarn build-pkg rancher-pod-metrics

# 2. Serve locally
yarn serve-pkgs
```

**Output:**
```
Serving packages:
  rancher-pod-metrics-1.0.0 available at: 
  http://127.0.0.1:4500/rancher-pod-metrics-1.0.0/rancher-pod-metrics-1.0.0.umd.min.js
```

**Trong Rancher UI:**
1. Enable Developer Features (Preferences → Advanced Features)
2. Extensions → ⋮ → Developer load
3. URL: `http://127.0.0.1:4500/rancher-pod-metrics-1.0.0/rancher-pod-metrics-1.0.0.umd.min.js`
4. Click Load

---

## 📦 Release Extension

### Bước 1: Update Version

```bash
# Edit pkg/rancher-pod-metrics/package.json
"version": "1.0.1"  # Bump version
```

### Bước 2: Create Tag & Release

```bash
# Create tag với format: <extension-name>-<version>
git add .
git commit -m "feat: Add Pod CPU and RAM metrics extension"
git tag rancher-pod-metrics-1.0.0
git push origin main
git push origin rancher-pod-metrics-1.0.0
```

### Bước 3: GitHub Release

Vào: `https://github.com/haison0211/rancher-extension/releases/new?tag=rancher-pod-metrics-1.0.0`

**Title:** `rancher-pod-metrics-1.0.0`

**Description:**
```markdown
## Pod Metrics Extension v1.0.0

### Features
- ✨ Add CPU column to Pod Explorer (vCPU)
- ✨ Add RAM column to Pod Explorer (MiB/GiB)
- 🔄 Auto-refresh metrics every 3 seconds
- ↕️ Sortable columns
- 🛡️ Error handling for missing metrics-server

### Requirements
- Rancher >= 2.8.0
- metrics-server installed in cluster

### Installation
Add Helm repository:
https://haison0211.github.io/rancher-extension
```

### Bước 4: Workflow Auto-build

GitHub Actions sẽ tự động:
- Build extension
- Create Helm chart
- Deploy to `gh-pages` branch

### Bước 5: Install trong Rancher

```
1. Extensions → Manage Repositories → Create
2. Name: my-extensions
3. Index URL: https://haison0211.github.io/rancher-extension
4. Tab Available → Find "rancher-pod-metrics"
5. Click Install
6. Reload page
```

---

## 🔍 Troubleshooting

### 1. Metrics không hiển thị?

**Check metrics-server:**
```bash
kubectl get deployment metrics-server -n kube-system
```

**Test API:**
```bash
kubectl get --raw /apis/metrics.k8s.io/v1beta1/pods
```

**Install metrics-server nếu chưa có:**
```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

### 2. Extension không load?

- Clear browser cache: `Cmd + Shift + R`
- Check console errors: F12 → Console
- Verify extension trong Extensions page
- Check tag format: `rancher-pod-metrics-1.0.0` (KHÔNG phải `v1.0.0`)

### 3. Build errors?

```bash
# Clean và rebuild
yarn clean
yarn install
yarn build-pkg rancher-pod-metrics
```

### 4. Sorting không hoạt động?

- Verify headers có `sort: ['metrics.cpu']`
- Check `enhancedRows` có trả về data với nested `metrics` object
- Inspect trong Vue DevTools

---

## 🎓 Giải thích Kiến trúc

### Tại sao kiến trúc này phù hợp?

#### 1. **Non-invasive**
- Không modify Rancher core source code
- Chỉ extend thông qua plugin API
- Dễ maintain khi Rancher upgrade

#### 2. **Declarative Registration**
```typescript
plugin.register('list', 'pod', component)
```
- Rancher tự động routing
- Auto-apply cho đúng resource type
- Không cần manual route config

#### 3. **Component Reuse**
- Sử dụng `ResourceTable` component có sẵn
- Tận dụng sorting/filtering logic của Rancher
- Consistent UI/UX với Rancher default

#### 4. **Performance**
- Client-side sort (không cần API call)
- Efficient polling (chỉ fetch metrics, không fetch pods)
- Map lookup O(1) cho metrics matching

#### 5. **Type Safety**
- Full TypeScript support
- Compile-time error checking
- Better IDE autocomplete

#### 6. **Separation of Concerns**
```
types/     → Data structures
utils/     → Business logic
list/      → Presentation layer
index.ts   → Registration
```

---

## 📊 Performance Considerations

### Metrics Polling Strategy

**Current:** Poll every 3s for all pods
```typescript
setInterval(() => loadMetrics(), 3000)
```

**Pros:**
- Simple implementation
- Always up-to-date
- Works với mọi số lượng pods

**Cons:**
- Fixed interval (không adaptive)
- Fetch cả namespace nếu có nhiều pods

**Optimization Ideas:**
1. **Adaptive polling**: Slow down khi tab inactive
2. **Namespace filtering**: Chỉ fetch pods trong current namespace
3. **WebSocket**: Use Kubernetes watch API (phức tạp hơn)

### Client-side vs Server-side Sort

**Current:** Client-side sort
- **Pros**: Instant, no API delay
- **Cons**: Chỉ sort pods đã load (pagination issue)

**If có >1000 pods:**
- Consider server-side sort via API query params
- Implement virtual scrolling

---

## 🔗 References

### Rancher Extension APIs
- Plugin Registration: https://extensions.rancher.io/extensions/next/api/plugins
- Component System: https://extensions.rancher.io/extensions/next/api/components
- Type System: https://extensions.rancher.io/extensions/next/api/types

### Kubernetes Metrics API
- Metrics Server: https://github.com/kubernetes-sigs/metrics-server
- API Spec: https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/

---

## ✅ Summary

Extension **rancher-pod-metrics** là một ví dụ hoàn chỉnh về:

1. ✅ **Extend existing Rancher UI** (Pod Explorer)
2. ✅ **Fetch external data** (metrics.k8s.io API)
3. ✅ **Real-time updates** (polling mechanism)
4. ✅ **Interactive table** (sortable columns)
5. ✅ **Error handling** (graceful degradation)
6. ✅ **TypeScript best practices**
7. ✅ **Production-ready code**

Code sẵn sàng để:
- ✅ Deploy lên Rancher production
- ✅ Publish lên Helm repository
- ✅ Maintain và extend thêm features

🎉 **Extension hoàn chỉnh và ready to use!**
