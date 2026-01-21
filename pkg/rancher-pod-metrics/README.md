# 📊 Rancher Pod Metrics Extension

Extension này thêm cột **CPU** và **RAM** vào Pod Explorer và Nod### 5. **Entry Point** (`index.ts`)
Register components:
```typescript
// Register Pod list override
plugin.register('list', 'pod', () => import('./list/pod.vue'));

// Auto-load detail components (node.vue)
importTypes(plugin);
```

## 📍 Supported Pages

### 1. Pod Explorer
**URL**: `/c/local/explorer/pod`

Metrics được thêm vào list view với approach **extending**:
- Kế thừa toàn bộ default functionality
- Chỉ inject thêm CPU/RAM columns
- Tự động refresh mỗi 10s

### 2. Node Detail - Pods Tab
**URL**: `/c/local/explorer/node/<node_name>#pods`

Metrics được thêm vào Pods tab với approach **cloning**:
- Copy full component từ Rancher
- Inject metrics vào table headers
- Tự động refresh mỗi 10sail's Pods tab trong Rancher Dashboard, với khả năng sort và auto-refresh mỗi 10 giây.

## ✨ Features

- ✅ **CPU Column**: Hiển thị CPU usage với đơn vị vCPU (ví dụ: "0.98 vCPU")
- ✅ **RAM Column**: Hiển thị Memory usage với đơn vị MiB/GiB
- ✅ **Auto-refresh**: Metrics tự động cập nhật mỗi 10 giây
- ✅ **Adaptive Polling**: Tự động giảm xuống 60s khi tab không active (tiết kiệm resources)
- ✅ **Sortable**: Click vào header để sort ascending/descending
- ✅ **Multi-page Support**: Hoạt động trên cả Pod Explorer và Node Detail page
- ✅ **Error Handling**: Xử lý gracefully khi metrics-server không available
- ✅ **Loading State**: Hiển thị spinner khi đang fetch metrics

## 🏗️ Kiến trúc

### Pod Explorer - Extending Approach

1. **Extension Registration**: 
   - Sử dụng `plugin.register('list', 'pod', ...)` để override Pod list component
   - Rancher Dashboard sẽ load custom component thay vì default
   - **Kế thừa** ResourceTable và **chỉ thêm** headers + template slots

2. **Metrics Fetching**:
   - Fetch từ API: `/k8s/clusters/{clusterId}/apis/metrics.k8s.io/v1beta1/pods`
   - Parse response và convert sang đơn vị hiển thị (vCPU, MiB)
   - Store trong Map với key là `namespace/podName`

3. **Table Enhancement**:
   - Inject 2 cột mới vào vị trí: `Node | CPU | RAM | Age`
   - Sử dụng template slots để custom cell rendering
   - Tận dụng ResourceTable's built-in sorting logic

4. **Auto-refresh**:
   - Active tab: refresh mỗi 10s
   - Inactive tab: giảm xuống 60s để tiết kiệm resources
   - Cleanup interval trong `beforeUnmount()` hook

### Node Detail - Cloning Approach

1. **Component Override**:
   - Sử dụng `importTypes(plugin)` để auto-load `detail/node.vue`
   - **Copy toàn bộ** Node detail component từ Rancher source
   - **Inject thêm** metrics logic vào component đã copy

2. **Why Cloning?**:
   - Rancher Extension API chưa hỗ trợ extend tabs/sections của detail pages
   - Cần full control để thêm metrics vào Pods tab
   - Trade-off: Code dài hơn nhưng có full customization

3. **Metrics Integration**:
   - Add metrics state vào component data
   - Load metrics trong `async fetch()` hook
   - Inject columns vào podTableHeaders computed property
   - Cleanup trong `beforeDestroy()` hook

## 📁 Cấu trúc Files

```
pkg/rancher-pod-metrics/
├── index.ts                    # Entry point - register components
├── package.json                # Extension metadata
├── types/
│   └── pod-metrics.ts          # TypeScript definitions
├── utils/
│   └── metrics.ts              # Metrics parsing & fetching logic
├── list/
│   └── pod.vue                 # Custom Pod list component (extending)
└── detail/
    └── node.vue                # Custom Node detail component (cloning)
```

## 🔑 Key Components

### 1. **Types** (`types/pod-metrics.ts`)
Định nghĩa TypeScript interfaces cho:
- API response từ metrics.k8s.io
- Parsed metrics data structure

### 2. **Utils** (`utils/metrics.ts`)
Functions để:
- Parse CPU (nanocores/millicores → millicores)
- Parse Memory (Ki/Mi/Gi → MiB)
- Format để hiển thị
- Fetch metrics từ API

### 3. **List Component** (`list/pod.vue`)
Vue component cho Pod Explorer:
- Kế thừa ResourceTable component
- Inject custom headers (CPU, RAM)
- Fetch & auto-refresh metrics mỗi 10s
- Custom cell templates cho hiển thị metrics

### 4. **Detail Component** (`detail/node.vue`)
Vue component cho Node detail page:
- Copy toàn bộ từ Rancher's node.vue
- Add metrics state và loading logic
- Inject metrics columns vào Pods tab
- Auto-refresh mỗi 10s

### 5. **Entry Point** (`index.ts`)
Register custom list component:
```typescript
plugin.register('list', 'pod', () => import('./list/pod.vue'));
```

## 🚀 Build & Deploy

### Build Extension

```bash
# Build single extension
yarn build-pkg rancher-pod-metrics

# Build all extensions
yarn build-pkg my-first-extension rancher-pod-metrics
```

Output: `dist-pkg/rancher-pod-metrics-1.0.0/`

### Test in Dev Mode

```bash
API=https://your-rancher.com yarn dev
```

Navigate to: `https://localhost:8005/dashboard/c/local/explorer/pod`

### Release

1. Update version trong `pkg/rancher-pod-metrics/package.json`
2. Create tag: `git tag rancher-pod-metrics-1.0.0`
3. Push tag: `git push origin rancher-pod-metrics-1.0.0`
4. Create GitHub Release
5. Workflow sẽ auto-build và publish

## ⚙️ Requirements

- **Rancher**: >= v2.8.0
- **metrics-server**: Must be installed in cluster
- **Node.js**: >= v20

## 🔍 Troubleshooting

### Metrics không hiển thị?

1. **Check metrics-server**:
   ```bash
   kubectl get deployment metrics-server -n kube-system
   ```

2. **Test API manually**:
   ```bash
   kubectl get --raw /apis/metrics.k8s.io/v1beta1/pods
   ```

3. **Check browser console**: Look for API errors

### Extension không load?

1. Clear browser cache
2. Check extension trong Extensions page
3. Verify tag format: `rancher-pod-metrics-1.0.0`

## 📖 Rancher Extension APIs Sử dụng

| API | Mục đích |
|-----|----------|
| `plugin.register('list', 'pod', ...)` | Override Pod list component |
| `importTypes(plugin)` | Auto-import các components từ folders |
| `ResourceTable` | Base table component của Rancher |
| `$store.getters['cluster/all']` | Lấy Pod resources |
| `$store.$axios` | HTTP client để call APIs |
| `$route.params.cluster` | Lấy cluster ID từ route |

## 🎯 Lý do Kiến trúc này Phù hợp

1. **Non-invasive**: Không modify core Rancher code, chỉ extend qua plugin API
2. **Declarative**: Use Rancher's component registration system
3. **Reusable**: Utils có thể dùng cho các extensions khác
4. **Type-safe**: Full TypeScript support
5. **Performance**: Client-side sort, efficient polling
6. **Maintainable**: Clear separation of concerns

## 📝 License

MIT

## 🤝 Contributing

PRs welcome!
