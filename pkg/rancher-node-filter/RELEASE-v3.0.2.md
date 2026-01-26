# Release v3.0.2 - Critical Fix for Extension Loading

## What's Fixed

### Extension Metadata Loading Issue

**Problem**: Extension failed to load with error:
```
TypeError: Cannot read properties of undefined (reading 'resource-list')
at Object.getUIConfig (extension-manager-impl.js:420:23)
```

**Root Cause**: Manually setting `plugin.metadata = require('./package.json')` in index.ts caused issues with Rancher's extension-manager in certain build configurations.

**Fix**: Removed manual metadata assignment. Rancher automatically loads metadata from package.json during extension initialization.

## Changes

**File**: `pkg/rancher-node-filter/index.ts`

```diff
- // Provide plugin metadata from package.json
- plugin.metadata = require('./package.json');
+ // NOTE: plugin.metadata is automatically loaded from package.json by Rancher
+ // No need to manually set it here
```

## Impact

- ✅ Extension now loads correctly on ALL Rancher installations
- ✅ No more `reading 'resource-list'` errors
- ✅ Disk column and Settings button now visible
- ✅ All features work as expected

## Upgrade Instructions

### From v3.0.0 or v3.0.1 to v3.0.2

1. **In Rancher UI**:
   - Go to Extensions page
   - Find `rancher-node-filter`
   - Click Update → Select v3.0.2
   - Click Install

2. **Clear browser cache**:
   - Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
   - Or clear site data in DevTools

3. **Verify**:
   - Navigate to `/c/local/explorer/node`
   - Check browser console - should be NO errors
   - Disk column should be visible
   - Settings button should be visible

## Notes

### About metrics-server 503 Error

If you see:
```
GET .../apis/metrics.k8s.io/v1beta1/pods 503 (Service Unavailable)
```

This is a **separate issue** from extension loading. It means:
- metrics-server is installed but not ready yet
- Wait a few minutes for metrics-server to start
- Verify: `kubectl get deployment metrics-server -n kube-system`

### What Works Without metrics-server

- ✅ Extension loads successfully
- ✅ Node list displays
- ✅ Label filtering works
- ❌ CPU/RAM metrics show "n/a" (expected)
- ❌ Disk metrics show "n/a" (expected)

Once metrics-server is ready, metrics will appear automatically.

## Testing

Verified on:
- Rancher v2.13.1
- EKS clusters with/without Prometheus
- Different browser cache states
- Fresh installations

---

**Critical**: If you had v3.0.0 or v3.0.1 and saw the `resource-list` error, **please upgrade to v3.0.2 immediately**.
