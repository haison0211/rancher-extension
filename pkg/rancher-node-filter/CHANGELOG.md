# Changelog

All notable changes to the Rancher Node & Pod Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [6.0.0] - 2026-02-21

### Added - HTTP Proxy Feature
- **HTTP Proxy for Pods**: New "Proxy HTTP Endpoint" action in Pod resource menu
- **HTTP Proxy for Services**: New "Proxy HTTP Endpoint" action in Service resource menu
- **Multi-Port Support**: Automatic detection and selection for pods/services with multiple ports
- **Multi-Container Support**: Container selection for pods with multiple containers
- **Custom Port Override**: Ability to specify custom port not defined in resource spec
- **HTTP Method Selection**: Support for GET, POST, PUT, DELETE, PATCH methods
- **Path Configuration**: Configurable HTTP path with proper URL encoding
- **RBAC-Aware Error Handling**: Clear permission error messages for 403 Forbidden
- **Timeout Protection**: 10-second timeout using AbortController
- **Response Size Limits**: 1MB maximum response with truncation warning
- **Status Code Handling**: Graceful handling of 401, 403, 404, 503, 5xx errors
- **Response Formatting**: Auto-detect JSON and format with syntax highlighting
- **ExternalName Service Detection**: Disable proxy for ExternalName services
- **Endpoint Warning**: Show warning for services without selectors

### Technical Implementation
- New composable: `composables/useProxyRequest.ts` - Core proxy logic
- New component: `components/ProxyModal.vue` - Proxy UI modal
- New model: `models/pod.js` - Pod proxy action
- New model: `models/service.js` - Service proxy action
- Registered ProxyModal as window modal in plugin
- Full TypeScript support with proper type definitions
- Uses Rancher's authenticated axios instance
- No global state mutation - isolated component state

### Compatibility
- Fully compatible with Rancher 2.13.1
- Works with downstream clusters (not limited to 'local')
- Uses standard Kubernetes API proxy pattern
- No breaking changes to existing features
- All previous features remain intact and functional

### Security & Safety
- Client-side timeout protection (default 10s)
- Response size limiting (max 1MB)
- No token/auth header exposure in logs
- RBAC permission validation
- Proper URL encoding to prevent injection
- AbortController for cancellable requests

### Performance
- Minimal bundle size impact (~10KB gzipped for new code)
- No performance degradation on existing features
- Lazy-loaded modal component
- No additional polling or background jobs

## [5.0.0] - 2026-02-09

### Added
- **Pod Metrics Integration**: Merged rancher-pod-metrics functionality
- **CPU/RAM Columns in Pod Explorer**: Auto-refresh every 30s
- **Pod Metrics in Node Detail**: CPU/RAM columns in Pods tab
- **Adaptive Polling**: 60s interval when tab inactive

### Changed
- Unified extension - removed dependency on separate pod-metrics extension

### Fixed
- Resolved extension conflict between rancher-node-filter and rancher-pod-metrics
- Fixed missing pod metrics in Node Detail view

## [4.0.2] - 2026-02-09

### Fixed
- Removed unnecessary detail component override
- Fixed Pods tab not showing in Node Detail view
- Restored default Rancher node detail functionality

## [4.0.1] - 2026-02-02

### Added
- **Graceful RBAC Permission Handling**: Warning banner for insufficient permissions
- **Permission-aware Caching**: Cache negative results to prevent API spam on 403 errors

### Changed
- Console errors changed to info messages for permission issues
- Improved UX with clear permission requirement messages

### Fixed
- Fixed disk metrics showing errors for users without `services/proxy` permission

## [4.0.0] - 2026-02-02

### Added
- **Shell into Node**: Lens-equivalent node shell access feature
- Direct shell access to node filesystem via privileged pod with nsenter
- Auto-cleanup system for shell pods (3-layer strategy)
- Background cleanup job runs every 5 minutes
- Pods run with system-node-critical priority
- Pods auto-delete after 30 minutes or on completion

## [3.0.1] - 2026-01-26

### Fixed
- **Critical**: Extension load failure on clusters without Prometheus
- Added comprehensive null safety checks
- Works on ALL cluster types (with or without Prometheus)

## [3.0.0] - 2026-01-25

### Added
- **Prometheus Disk Usage Monitoring**
- Configurable Prometheus endpoint with Settings UI
- Persistent configuration (localStorage)

### Changed
- Cache TTL synchronized (25s for all metrics)

### Removed
- Debug logs (production-ready)

## [2.0.0] - Earlier

### Added
- Synchronized metrics (CPU/RAM)
- Fixed Rancher v2.13.1 cache bug

## [1.4.0] - Earlier

### Added
- Label filtering
- Basic metrics display

---

## Upgrade Notes

### v5.0.0 → v6.0.0
- **No Breaking Changes**: All existing features work as before
- **New Feature Available**: HTTP Proxy action now available on Pods and Services
- **No Configuration Required**: Feature works out-of-the-box
- **RBAC Requirements**: Users need `get` permission on `pods/proxy` or `services/proxy` subresources to use proxy feature

### v4.x → v5.0.0
- **Uninstall rancher-pod-metrics**: If you have it installed, remove it to avoid conflicts
- v5.0.0 includes all pod-metrics functionality

### v3.x → v4.0.0
- **New Shell Feature**: New "Shell" action available in node action menu
- **New Namespace**: Creates `node-shell` namespace automatically
- **RBAC Required**: Needs permissions to create pods and namespaces

---

## Support & Issues

For issues, feature requests, or questions:
- GitHub Issues: https://github.com/haison0211/rancher-extension/issues
- Check TROUBLESHOOTING.md for common issues
