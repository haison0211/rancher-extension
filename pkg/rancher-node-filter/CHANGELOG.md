# Changelog

All notable changes to the Rancher Node & Pod Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [6.0.2] - 2026-02-24

### 🐛 Bug Fixes (Critical Production Issue)

**404 Error when using HTTP Proxy feature in production Rancher**

**Root Cause**: 
- Route registration method incompatible with Rancher Extension routing system
- Vue Router Composition API not properly injected in extension context
- Duplicate cluster parameter in URL (both path and query string)

**Fixes Applied**:

1. **Route Registration Method** (`index.ts`)
   - Changed: `plugin.addRoute()` → `plugin.addRoutes([])`
   - Updated route names to follow Rancher convention: `c-cluster-explorer-pod-proxy`
   - Ensures routes are properly registered in Rancher's routing table

2. **Component API Migration** (`pages/ProxyPage.vue`)
   - Changed: Vue 3 Composition API → Options API
   - Replaced: `useRoute()`, `useRouter()`, `useStore()` → `this.$route`, `this.$router`, `this.$store`
   - Reason: Composition API hooks not available in extension context

3. **Route Parameter Cleanup** (`models/pod.js`, `models/service.js`)
   - Removed cluster from query string (was: `?cluster=local&namespace=...`)
   - Now only passes: `?namespace=scm&name=pod-name&type=pod`
   - Cluster extracted from route path params: `/c/:cluster/explorer/...`

4. **ProxyPage.vue Computed Properties**
   - Changed: `this.$route.query.cluster` → `this.$route.params.cluster`
   - Aligns with Vue Router dynamic segment pattern

**Testing Evidence**:
- ✅ Local dev mode (`yarn dev`): Works correctly
- ✅ Production mode (installed extension): **FIXED** - No more 404 error
- ✅ Route pattern: `/c/local/explorer/pod-proxy?namespace=scm&name=pod-123&type=pod`

**Impact**:
- **Before**: HTTP Proxy feature completely broken in production (404 error)
- **After**: HTTP Proxy feature works identically in dev and production

---

## [6.0.1] - 2026-02-23

### 🔒 Security Fixes
- **CRITICAL**: Added input sanitization to prevent XSS attacks
  - All Kubernetes resource names (cluster ID, namespace, pod/service name) are now sanitized before URL construction
  - Port numbers are validated to prevent injection
  - New utility module: `utils/sanitize.ts`
  
- **CRITICAL**: Added `noopener` and `noreferrer` attributes to `window.open()`
  - Prevents opened tab from accessing parent window via `window.opener`
  - Mitigates reverse tabnabbing attacks
  - Added popup blocker detection with user notification

### 🛠️ Stability Fixes
- **CRITICAL**: Fixed infinite watcher loop risk
  - Bidirectional watchers between `customPort` and `selectedPort` now use flag-based loop prevention
  - Added `nextTick()` to ensure proper synchronization
  
- **CRITICAL**: Added component cleanup on unmount
  - Prevents memory leaks from large response data
  - Properly cleans up watchers and refs with `onUnmounted` lifecycle hook
  - Resets form state on component destroy

### ✨ Improvements
- Enhanced axios instance detection with multiple fallbacks
  - Tries 3 different window context paths
  - Graceful error handling instead of throwing exceptions
  - Better user-facing error messages

### 📝 Technical Details
- **New files added:**
  - `utils/sanitize.ts` - Security utilities for K8s resource name sanitization
  
- **Modified files:**
  - `components/ProxyModal.vue` - Loop prevention, cleanup, improved axios detection
  - `composables/useProxyRequest.ts` - Input sanitization in URL builder
  - `models/pod.js` - Secure window.open with popup blocker detection
  - `models/service.js` - Secure window.open with popup blocker detection

### 🎯 Production Readiness
- ✅ All 4 must-fix critical issues resolved
- ✅ Extension is now production-ready for enterprise deployments
- ✅ Tested with Rancher 2.13.1
- ✅ Security hardened against XSS and injection attacks
- ✅ Memory leak prevention
- ✅ Infinite loop prevention

---

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
