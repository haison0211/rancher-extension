# 🔍 Rancher Node Filter Extension

**Version**: 3.0.1 | **Status**: Production Ready ✅

Extension này mở rộng **Node Explorer** trong Rancher Dashboard với 3 tính năng chính:
1. **Label Filtering**: Filter nodes theo labels
2. **Synchronized Metrics**: Fix sự sai lệch CPU/RAM giữa Node List và Node Detail
3. **Disk Usage Monitoring**: Hiển thị disk usage từ Prometheus (tùy chọn)

> 🆕 **v3.0.1**: Fixed critical bug - Extension now works on ALL clusters (with or without Prometheus). See [CHANGELOG](./CHANGELOG.md) for details.

## ✨ Features

### 1. Label Filtering
- ✅ **Label Key Dropdown**: Dropdown list chứa tất cả label keys có sẵn từ các nodes
- ✅ **Label Value Filter**: Text field để nhập label value cần tìm
- ✅ **Real-time Filtering**: Lọc ngay lập tức khi nhập
- ✅ **Partial Match**: Hỗ trợ tìm kiếm partial string (contains)
- ✅ **Clear Filter**: Button để clear filter và hiển thị lại tất cả nodes
- ✅ **Filter Info**: Hiển thị số lượng nodes được tìm thấy
- ✅ **Smart Label Keys**: Tự động loại bỏ các system labels để UX sạch hơn
- ✅ **Preserve Features**: Giữ nguyên sort, pagination, và tất cả features mặc định

### 2. Synchronized Metrics (v1.4.0+)
- ✅ **Consistent CPU Usage**: Dùng actual usage từ metrics-server (như Node Detail)
- ✅ **Consistent RAM Usage**: Dùng actual usage từ metrics-server (như Node Detail)
- ✅ **Fixed RAM Capacity**: Dùng allocatable thay vì capacity (như Node Detail)
- ✅ **Same as kubectl top nodes**: Metrics giờ khớp với `kubectl top nodes`
- ✅ **EKS Norman Fix**: Không còn dùng Pod Requests cho EKS clusters từ Norman
- ✅ **Cache Optimization**: 25 giây cache TTL (cân bằng giữa freshness và performance)

### 3. Disk Usage Monitoring (v3.0.0+) ⭐ NEW
- ✅ **Prometheus Integration**: Query disk metrics từ Prometheus node-exporter
- ✅ **Configurable Endpoint**: Settings UI để cấu hình Prometheus service
- ✅ **Graceful Degradation**: Hoạt động bình thường nếu Prometheus không khả dụng
- ✅ **Efficient Querying**: 1 request duy nhất cho tất cả nodes
- ✅ **Shared Cache**: 25 giây cache TTL (đồng bộ với CPU/RAM)
- ✅ **Auto-refresh**: Tự động refresh mỗi 30 giây
- ✅ **Flexible Matching**: Tự động match nodes theo IP bất kể port configuration

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

### 2. Disk Usage Configuration
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
