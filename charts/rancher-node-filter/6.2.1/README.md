# 🔍 Rancher Node & Pod Extension

**Version**: 6.0.0 | **Status**: Production Ready ✅

All-in-one extension mở rộng **Node Explorer** và **Pod Explorer** trong Rancher Dashboard với 6 tính năng chính:
1. **Label Filtering**: Filter nodes theo labels
2. **Synchronized Metrics**: Fix sự sai lệch CPU/RAM giữa Node List và Node Detail
3. **Disk Usage Monitoring**: Hiển thị disk usage từ Prometheus (tùy chọn)
4. **Shell into Node**: Lens-equivalent node shell access
5. **Pod Metrics**: CPU/RAM metrics trong Pod Explorer
6. **HTTP Proxy**: Test HTTP endpoints cho Pods và Services ⭐ NEW

> 🆕 **v6.0.0**: HTTP Proxy Feature - Test HTTP endpoints directly from Rancher UI! New "Proxy HTTP Endpoint" action available on Pods and Services. Fully compatible with Rancher 2.13.1.

## ✨ Features

### 1. Label Filtering (Nodes)
- ✅ **Label Key Dropdown**: Dropdown list chứa tất cả label keys có sẵn từ các nodes
- ✅ **Label Value Filter**: Text field để nhập label value cần tìm
- ✅ **Real-time Filtering**: Lọc ngay lập tức khi nhập
- ✅ **Partial Match**: Hỗ trợ tìm kiếm partial string (contains)
- ✅ **Clear Filter**: Button để clear filter và hiển thị lại tất cả nodes
- ✅ **Filter Info**: Hiển thị số lượng nodes được tìm thấy
- ✅ **Smart Label Keys**: Tự động loại bỏ các system labels để UX sạch hơn
- ✅ **Preserve Features**: Giữ nguyên sort, pagination, và tất cả features mặc định

### 2. Synchronized Metrics (Nodes)
- ✅ **Consistent CPU Usage**: Dùng actual usage từ metrics-server (như Node Detail)
- ✅ **Consistent RAM Usage**: Dùng actual usage từ metrics-server (như Node Detail)
- ✅ **Fixed RAM Capacity**: Dùng allocatable thay vì capacity (như Node Detail)
- ✅ **Same as kubectl top nodes**: Metrics giờ khớp với `kubectl top nodes`
- ✅ **EKS Norman Fix**: Không còn dùng Pod Requests cho EKS clusters từ Norman
- ✅ **Cache Optimization**: 25 giây cache TTL (cân bằng giữa freshness và performance)

### 3. Disk Usage Monitoring (Nodes)
- ✅ **Prometheus Integration**: Query disk metrics từ Prometheus node-exporter
- ✅ **Configurable Endpoint**: Settings UI để cấu hình Prometheus service
- ✅ **Graceful Degradation**: Hoạt động bình thường nếu Prometheus không khả dụng
- ✅ **RBAC Permission Handling**: Warning banner cho users không có `services/proxy` permission
- ✅ **Efficient Querying**: 1 request duy nhất cho tất cả nodes
- ✅ **Shared Cache**: 25 giây cache TTL (đồng bộ với CPU/RAM)
- ✅ **Auto-refresh**: Tự động refresh mỗi 30 giây
- ✅ **Flexible Matching**: Tự động match nodes theo IP bất kể port configuration
- ✅ **No Console Spam**: Cache negative results để tránh repeated 403 errors

### 4. Shell into Node ⭐
- ✅ **Lens-equivalent**: Tương tự tính năng "Shell into Node" của Lens IDE
- ✅ **Direct Node Access**: Shell vào node filesystem (không phải container)
- ✅ **Privileged Pod**: Tự động tạo privileged pod với nsenter
- ✅ **Auto-cleanup**: Pod tự động xóa sau 30 phút hoặc khi complete
- ✅ **Background Job**: Cleanup job chạy mỗi 5 phút để xóa old pods
- ✅ **Node Namespace**: Pods tạo trong namespace `node-shell`
- ✅ **System Priority**: Priority class `system-node-critical`
- ✅ **Tolerate All**: Tolerate tất cả taints để chạy trên mọi node

### 5. Pod Metrics ⭐ (v5.0.0)
- ✅ **CPU Column**: Hiển thị CPU usage với đơn vị vCPU (ví dụ: "0.98 vCPU")
- ✅ **RAM Column**: Hiển thị Memory usage với đơn vị MiB/GiB  
- ✅ **Auto-refresh**: Metrics tự động cập nhật mỗi 30 giây
- ✅ **Adaptive Polling**: Tự động giảm xuống 60s khi tab không active
- ✅ **Sortable**: Click vào header để sort ascending/descending
- ✅ **Error Handling**: Xử lý gracefully khi metrics-server không available
- ✅ **Loading State**: Hiển thị spinner khi đang fetch metrics
- ✅ **WebSocket Integration**: Tự động refresh khi pods thay đổi

### 6. HTTP Proxy ⭐ NEW (v6.0.0)
- ✅ **Pod HTTP Proxy**: Test HTTP endpoints directly on Pods
- ✅ **Service HTTP Proxy**: Test HTTP endpoints directly on Services
- ✅ **Multi-Port Support**: Automatic detection and selection for multiple ports
- ✅ **Multi-Container Support**: Container selection for multi-container pods
- ✅ **Custom Port Override**: Specify custom ports not defined in resource
- ✅ **HTTP Methods**: Support for GET, POST, PUT, DELETE, PATCH
- ✅ **Path Configuration**: Configurable HTTP path with proper encoding
- ✅ **RBAC-Aware Errors**: Clear permission messages for 403 Forbidden
- ✅ **Timeout Protection**: 10-second timeout with AbortController
- ✅ **Response Limits**: 1MB max response with truncation warning
- ✅ **Status Code Handling**: Graceful handling of 401, 403, 404, 503, 5xx
- ✅ **Response Formatting**: Auto-detect JSON with syntax highlighting
- ✅ **ExternalName Detection**: Disable proxy for ExternalName services

## 🐛 Vấn đề được giải quyết

### Synchronized Metrics
**Vấn đề ban đầu**: Trên cùng 1 node, metrics hiển thị khác nhau:
- **Node List** (/c/local/explorer/node): **95% CPU**
- **Node Detail** (/c/local/explorer/node/{name}#pods): **53% CPU**

**Nguyên nhân**:
1. **EKS Norman clusters**: Node List dùng **Pod Requests** thay vì **Actual Usage**
2. **RAM capacity**: Node List dùng **total capacity** thay vì **allocatable**

**Giải pháp**: Extension override Node model để:
- Luôn dùng actual usage từ metrics-server (giống Node Detail)
- Dùng allocatable cho cả CPU và RAM (giống Node Detail)

**So sánh trước/sau**:

| Metric | Trước (Node List) | Sau (Node List) | Node Detail |
|--------|-------------------|-----------------|-------------|
| CPU % | 95% (pod requests) | **53%** ✅ | 53% |
| RAM % | 75% (capacity) | **55%** ✅ | 55% |
| Disk % | N/A | **17.8%** ✅ | N/A |
| Shell | N/A | **✅ Available** | N/A |

## 📍 Sử dụng

### 1. Label Filtering
**URL**: /c/local/explorer/node

Filter được thêm vào trên Node list:
1. **Chọn Label Key**: Dropdown hiển thị tất cả label keys có sẵn
2. **Nhập Label Value**: Nhập text để filter (case-insensitive, partial match)
3. **View Results**: Table tự động filter để chỉ hiển thị matching nodes
4. **Clear**: Click "Clear Filter" để reset

**Ví dụ**:
- Filter nodes có label environment=production
- Filter nodes có label region chứa text us-west
- Filter nodes có label node-type chứa text worker

### 2. Shell into Node
**URL**: /c/local/explorer/node

**Cách sử dụng**:
1. Click vào **3-dot menu** (⋮) ở cuối mỗi node row
2. Chọn **"Shell"** từ dropdown menu
3. Extension sẽ tự động:
   - Tạo namespace `node-shell` (nếu chưa có)
   - Tạo privileged pod với nsenter
   - Đợi pod ready (60s timeout)
   - Mở terminal window với shell access
4. Test shell commands:
   ```bash
   hostname              # Node hostname
   ps aux | head         # Node processes
   df -h                 # Node disk usage
   ip addr               # Node network interfaces
   cat /etc/os-release   # OS information
   ```

**Pod Lifecycle**:
- **Timeout**: Pod tự động complete sau 30 phút
- **TTL**: Pod tự động xóa 5 phút sau khi complete (nếu cluster có TTL Controller)
- **Background Cleanup**: Job chạy mỗi 5 phút để xóa:
  - Pods đã complete/failed (xóa ngay)
  - Pods cũ hơn 30 phút
- **Manual Cleanup**: 
  ```bash
  kubectl delete pods -n node-shell --all
  ```

**Requirements**:
- ✅ RBAC permissions: create pods, namespaces
- ✅ Node must be in Ready/Active state
- ✅ Cluster supports privileged pods

### 3. Disk Usage Configuration
**Cấu hình Prometheus endpoint** (lần đầu sử dụng):

1. Click vào **Settings** button (gear icon) ở góc phải của filter row
2. Nhập Prometheus service endpoint theo format: namespace/services/service-name:port
3. **Ví dụ**: ops/services/ops-prometheus-server:80
4. Click **Save** để lưu cấu hình
5. Reload page để thấy disk metrics

**Format endpoint**:
```
<namespace>/services/<service-name>:<port>
```

**Ví dụ hợp lệ**:
- ops/services/ops-prometheus-server:80
- monitoring/services/prometheus:9090
- default/services/prom-server:8080

**Lưu ý**:
- Endpoint được lưu vào localStorage (persistent across sessions)
- Nếu Prometheus không khả dụng, disk column sẽ hiển thị "n/a"
- Click "Reset to Default" để quay về default endpoint

**RBAC Requirements** (v4.0.1+):
- ✅ **For Disk Metrics**: User cần permission `services/proxy` trong namespace chứa Prometheus
- ⚠️ **Without Permission**: Warning banner hiển thị + disk metrics ẩn
- 📖 **Permission Example**:
  ```yaml
  apiVersion: rbac.authorization.k8s.io/v1
  kind: ClusterRole
  metadata:
    name: prometheus-disk-metrics
  rules:
  - apiGroups: [""]
    resources: ["services/proxy"]
    verbs: ["get", "create"]
  ```
- 🎯 **Graceful Degradation**: Feature tự động ẩn cho users không có permission (không báo lỗi)

### 4. HTTP Proxy Usage ⭐ NEW (v6.0.0)
**Test HTTP endpoints trực tiếp trong Rancher UI:**

**For Pods**:
1. Navigate to **Pods** (Explorer → Workloads → Pods)
2. Click **3-dot menu** (⋮) on any running pod
3. Select **"Proxy HTTP Endpoint"**
4. Modal sẽ mở với các options:
   - **Container** (if multiple): Chọn container để test
   - **Port** (if multiple): Chọn port hoặc nhập custom port
   - **HTTP Path**: Nhập path (default `/`)
   - **HTTP Method**: Chọn GET, POST, PUT, DELETE, PATCH
5. Click **"Execute Proxy Request"**
6. Xem response trực tiếp trong modal

**For Services**:
1. Navigate to **Services** (Explorer → Service Discovery → Services)
2. Click **3-dot menu** (⋮) on any service
3. Select **"Proxy HTTP Endpoint"**
4. Modal sẽ mở với các options:
   - **Port** (if multiple): Chọn service port
   - **Custom Port**: Override với port khác (optional)
   - **HTTP Path**: Nhập path (default `/`)
   - **HTTP Method**: Chọn method
5. Click **"Execute Proxy Request"**
6. Xem response

**Ví dụ Use Cases**:
- Test health check endpoints: `/healthz`, `/ready`
- Debug API responses: `/api/v1/status`
- Verify service availability before ingress configuration
- Test different HTTP methods on RESTful APIs
- Check Pod/Service HTTP functionality without port-forward

**Requirements**:
- ✅ **For Pods**: RBAC permission `get` on `pods/proxy` subresource
- ✅ **For Services**: RBAC permission `get` on `services/proxy` subresource
- ✅ Pod must be in Running state
- ✅ Service must have valid ports (not ExternalName type)
- ✅ Port must be exposed on container/service

**RBAC Permission Example**:
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: http-proxy-user
rules:
- apiGroups: [""]
  resources: ["pods/proxy", "services/proxy"]
  verbs: ["get", "create"]
```

**Error Handling**:
- **403 Forbidden**: Clear message về missing RBAC permissions
- **404 Not Found**: Resource hoặc port không tồn tại
- **Timeout**: Request quá 10 giây
- **Large Response**: Response > 1MB sẽ bị truncate với warning

**Limitations**:
- Maximum response size: 1MB
- Request timeout: 10 seconds
- HTTP only (no HTTPS validation)
- Cannot proxy WebSocket connections
- Cannot set custom headers

## 🏗️ Kiến trúc

### Caching Strategy
```
// CPU/RAM/Disk metrics: 25 second TTL
const CACHE_TTL = 25000;

// Prometheus endpoint detection: 5 minute TTL
const PROMETHEUS_CACHE_TTL = 300000;

// Auto-refresh: Every 30 seconds
setInterval(() => this.loadMetrics(), 30000);
```

**Timeline**:
- 0s: Initial load → Fresh API requests
- 25s: Cache still valid → Use cache
- 30s: Auto-refresh → Cache expired → New API requests
- 60s: Auto-refresh → New API requests
- (repeats...)

### Prometheus Integration
Query tất cả nodes cùng lúc (efficient):
```
(1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100
```

**Endpoint Resolution**:
```
User Config: "ops/services/ops-prometheus-server:80"
         ↓
Full Path: "/api/v1/namespaces/ops/services/ops-prometheus-server:80/proxy"
         ↓
Query URL: "/k8s/clusters/local/api/v1/namespaces/ops/services/ops-prometheus-server:80/proxy/api/v1/query?query=..."
```

## 📁 Cấu trúc Files

```
pkg/rancher-node-filter/
├── index.ts                    # Plugin entry point
├── package.json                # Extension metadata (v3.0.0)
├── README.md                   # This file
├── components/
│   └── PrometheusSettings.vue  # Settings UI for Prometheus endpoint
├── list/
│   └── node.vue               # Extended Node List
├── models/cluster/
│   └── node.js                # Extended Node model
├── utils/
│   └── prometheus-config.js   # Prometheus config utilities
└── l10n/
    └── en-us.yaml             # Translations
```

## 🔧 Development

### Build Extension Package
```bash
# Build and package
yarn build-pkg rancher-node-filter

# Output: dist-pkg/rancher-node-filter-3.0.0/rancher-node-filter-3.0.0.tgz
```

## 📦 Installation

### Via Rancher UI (Recommended)
1. Go to **Extensions** → **Manage Extension Catalog**
2. Click **Install** và upload rancher-node-filter-3.0.0.tgz
3. Enable extension
4. Reload browser

## ⚙️ Configuration

### Tìm Prometheus service trong cluster
```bash
# List all Prometheus services
kubectl get svc -A | grep prometheus

# Example output:
# ops              ops-prometheus-server        ClusterIP   10.43.123.45   <none>        80/TCP    30d

# Use format: <namespace>/services/<service-name>:<port>
# Example: ops/services/ops-prometheus-server:80
```

## 🔍 Troubleshooting

### Extension không load / Console errors?

**Symptom**: `TypeError: Cannot read properties of undefined (reading 'resource-list')`

**Solution**: 
- Update to **v3.0.1 or later** - includes critical fixes for clusters without Prometheus
- See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for comprehensive debug guide

### Disk metrics không hiển thị (n/a)

**Diagnostic checklist**:

**1. Check Prometheus availability**:
```bash
kubectl get svc --all-namespaces | grep -i prometheus
```

**2. Test Prometheus endpoint**:
```javascript
// In browser console
fetch('/k8s/clusters/local/api/v1/namespaces/ops/services/ops-prometheus-server:80/proxy/api/v1/query?query=up')
  .then(r => r.json())
  .then(d => console.log('✅ Connected:', d))
  .catch(e => console.error('❌ Failed:', e));
```

**3. Check node-exporter**:
```bash
kubectl get ds -A | grep node-exporter
```

**Common solutions**:
- 🔧 **Configure endpoint**: Click Settings button → Enter your Prometheus service path
- 📦 **Install Prometheus**: Extension works without it, but no disk metrics
- 📖 **Read full guide**: See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed solutions

### Quick Fixes

| Issue | Quick Fix | Details |
|-------|-----------|---------|
| Extension not loading | Update to v3.0.1+ | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#1-extension-not-loading--console-errors) |
| Disk shows "n/a" | Configure Prometheus endpoint | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#2-disk-metrics-not-showing-shows-na) |
| Permission warning banner | Contact admin for services/proxy permission | See RBAC Requirements above |
| CPU/RAM missing | Install metrics-server | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#4-cpuram-metrics-not-showing) |
| Stale data | Hard refresh (Cmd+Shift+R) | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#7-metrics-stale--not-updating) |


## 📊 Performance

### API Calls (per page load)
- **CPU/RAM metrics**: 1 request (all nodes)
- **Disk metrics**: 1 request (all nodes) 
- **Total**: 2 API requests for 24 nodes

### Caching
- **Hit rate**: ~66% (2 out of 3 auto-refreshes use cache)
- **Freshness**: Max 25s stale data

## 🚀 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for full version history.

### v4.0.1 (2026-02-02) 🐛 Permission Handling Fix
- 🐛 **FIXED**: Graceful handling of insufficient RBAC permissions for Prometheus
- ✅ **ADDED**: Warning banner for users without `services/proxy` permission
- 🛡️ **IMPROVED**: Cache negative results to prevent API spam on 403 errors
- 📝 **IMPROVED**: Changed console errors to info messages for permission issues
- 🎯 **UX**: Clear message explaining permission requirements
- 📖 **DOCS**: Added RBAC requirements documentation

### v4.0.0 (2026-02-02) 🚀 Major Feature Release
- ✨ **NEW**: Shell into Node - Lens-equivalent node shell access
- ✨ **NEW**: Auto-cleanup system for shell pods (3-layer strategy)
- ✨ **NEW**: Background cleanup job runs every 5 minutes
- 🛡️ **SECURITY**: Pods run with system-node-critical priority
- 🧹 **CLEANUP**: Pods auto-delete after 30 minutes or on completion
- 📖 **DOCS**: Comprehensive Shell into Node documentation
- ⚙️ **CONFIG**: Pod namespace: `node-shell`, timeout: 30 minutes

### v3.0.1 (2026-01-26) 🔥 Critical Fix
- 🐛 **FIXED**: Extension load failure on clusters without Prometheus
- 🛡️ **ADDED**: Comprehensive null safety checks
- ✅ **IMPROVED**: Works on ALL cluster types (with or without Prometheus)
- 📖 **DOCS**: Added [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

### v3.0.0 (2026-01-25)
- ✨ **NEW**: Prometheus disk usage monitoring
- ✨ **NEW**: Configurable Prometheus endpoint với Settings UI
- ✨ **NEW**: Persistent configuration (localStorage)
- 🔧 **IMPROVED**: Cache TTL đồng bộ hóa (25s cho tất cả metrics)
- 🧹 **CLEANUP**: Removed debug logs, production-ready
- 📚 **DOCS**: Complete README với troubleshooting guide

### v2.0.0
- ✨ Synchronized metrics (CPU/RAM)
- 🐛 Fixed Rancher v2.13.1 cache bug

### v1.4.0
- ✨ Label filtering
- 📊 Basic metrics display

---

## 📚 Documentation

- **[README.md](./README.md)** - Main documentation (you are here)
- **[CHANGELOG.md](./CHANGELOG.md)** - Full version history with migration guides
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Comprehensive troubleshooting guide

---

**Made with ❤️ for the Rancher community**
