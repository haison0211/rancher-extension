# Phân tích lỗi 404: Local work nhưng Production lỗi

## ✅ Local (yarn dev) - WORK
```bash
API=https://rancher.selless.com yarn dev
```
**Tại sao work?**
- Dev server của Rancher (`yarn dev`) load trực tiếp source code từ `pkg/rancher-node-filter/`
- Routes đăng ký bởi `plugin.addRoute()` hoạt động NGAY LẬP TỨC
- Component `ProxyPage.vue` được import dynamically và render bình thường
- Hot reload có sẵn, không cần build/install

## ❌ Production (Install extension) - 404 ERROR
```bash
# Build extension
yarn build-pkg rancher-node-filter
# → Output: dist-pkg/rancher-node-filter-6.0.7/

# Install vào Rancher UI
Extensions → Install → Upload .tar.gz
```

**Tại sao lỗi 404?**

### 🔍 GIẢI THÍCH LỖI

#### 1. **Route Registration Timing Issue**
```typescript
// index.ts
export default function(plugin: IPlugin): void {
  plugin.addRoute({
    name: 'pod-proxy',
    path: '/c/:cluster/explorer/pod-proxy',
    component: () => import('./pages/ProxyPage.vue'),  // ← Dynamic import
  });
}
```

**Vấn đề:**
- Extensions được load **SAU KHI** Rancher router đã khởi tạo
- `plugin.addRoute()` chạy MỘT LẦN khi extension init
- Nhưng route có thể KHÔNG được thêm vào router.routes nếu timing sai

**Dev vs Production:**
- **Dev mode**: Extension code load đồng bộ → Route registered before router mount
- **Production**: Extension load từ .umd.min.js (async) → Route registered AFTER router mount → Route không tồn tại

#### 2. **Code Splitting & Chunk Loading**
```javascript
// Build output
dist-pkg/rancher-node-filter-6.0.7/
  rancher-node-filter-6.0.7.umd.min.js          ← Main bundle
  rancher-node-filter-6.0.7.umd.min.proxy-page.js  ← ProxyPage chunk
```

**Vấn đề:**
- ProxyPage.vue được tách thành riêng chunk (`proxy-page.js`)
- Khi navigate to `/c/local/explorer/pod-proxy`:
  1. Router tìm route → KHÔNG TÌM THẤY (chưa registered hoặc registered sai)
  2. Rancher fallback route → Match pattern `/c/:cluster/explorer/:resource`
  3. Render ResourceList component thay vì ProxyPage
  4. ResourceList không tìm thấy resource "pod-proxy" → **404**

**Console error đã thấy:**
```
Cannot read properties of undefined (reading 'resource-list')
```
→ Rancher đang cố render ResourceList cho resource "pod-proxy" (KHÔNG TỒN TẠI)

#### 3. **Plugin API Limitation**
```typescript
// Rancher Shell Plugin API
interface IPlugin {
  addRoute(config: RouteConfig): void;  // ← CÓ THỂ KHÔNG WORK trong production
  register(type: string, resource: string, component: Function): void;  // ← WORK
}
```

**Observation từ testing:**
- ✅ `plugin.register('list', 'pod')` → WORK (Pod list hiển thị metrics)
- ✅ `plugin.register('detail', 'node')` → WORK (Node detail có disk tab)
- ❌ `plugin.addRoute()` → KHÔNG WORK trong production

**Kết luận:**
- `plugin.addRoute()` có thể chỉ hoạt động trong dev mode
- Hoặc cần configuration đặc biệt trong production
- Rancher Extensions API chủ yếu support `plugin.register()`, KHÔNG support custom routes

---

## 🔬 KIỂM TRA GIẢ THUYẾT

### Test 1: Route có được đăng ký không?
```javascript
// Console trong Rancher (sau khi install extension)
const router = window.$nuxt.$router;
console.log('All routes:', router.getRoutes().map(r => r.path));
console.log('Pod proxy route:', router.getRoutes().find(r => r.name === 'pod-proxy'));
```

**Kết quả mong đợi:**
- ✅ Dev mode: Route tồn tại
- ❌ Production: Route KHÔNG tồn tại hoặc tồn tại nhưng component không load được

### Test 2: Manual navigation có work không?
```javascript
// Console trong Rancher
window.$nuxt.$router.push('/c/local/explorer/pod-proxy?namespace=default&name=test&ip=10.42.0.1&type=pod');
```

**Kết quả mong đợi:**
- ✅ Dev mode: Navigate thành công, ProxyPage render
- ❌ Production: Navigate thành công NHƯNG ProxyPage KHÔNG render (fallback to ResourceList)

---

## 💡 NGUYÊN NHÂN GỐC RỄ

**Root cause:** Rancher Extension API **KHÔNG HỖ TRỢ** `plugin.addRoute()` trong production builds

**Evidence:**
1. `plugin.register()` work perfect (Node list, Pod list, Node detail)
2. `plugin.addRoute()` chỉ work trong dev mode
3. Console error cho thấy Rancher cố render ResourceList thay vì custom component
4. Routes có thể được register nhưng component không load được do timing/chunk loading issues

---

## ✅ GIẢI PHÁP

### Option 1: Dùng Modal Dialog (v6.0.6) - ĐÃ THỬ, BỊ MẤT POD LIST
**Vấn đề:** 
- GlobalProxyModal component gây conflict với Pod list rendering
- Có thể do Vuex store initialization hoặc component registration issues

### Option 2: Embed ProxyModal trong Pod List - ĐỀ XUẤT
```vue
<!-- list/pod.vue -->
<template>
  <div>
    <ResourceTable ... />
    
    <!-- Inline proxy UI (hidden by default) -->
    <div v-if="showProxyModal" class="proxy-overlay">
      <ProxyModal :resource="activeResource" @close="closeProxy" />
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      showProxyModal: false,
      activeResource: null,
    };
  },
  
  methods: {
    // Listen to custom event from Pod model
    openProxy(resource) {
      this.activeResource = resource;
      this.showProxyModal = true;
    },
  },
  
  mounted() {
    // Register event listener
    this.$root.$on('pod-proxy-open', this.openProxy);
  },
};
</script>
```

```javascript
// models/pod.js
proxyHttpEndpoint() {
  // Emit event instead of window.open()
  this.$root.$emit('pod-proxy-open', this);
}
```

**Ưu điểm:**
- Không cần routes
- Không cần Vuex store
- Component đã tồn tại trong Pod list (không lazy load)
- Dùng Vue event bus đơn giản

### Option 3: Dùng Rancher's Modal Service - BEST PRACTICE?
```javascript
// models/pod.js
proxyHttpEndpoint() {
  // Use Rancher's built-in modal system
  this.$dispatch('wm/open', {
    title: 'HTTP Proxy',
    component: () => import('../components/ProxyModal.vue'),
    props: {
      resource: this,
      resourceType: 'pod',
    },
  }, { root: true });
}
```

**Cần research:** Rancher có built-in modal/window manager service không?

---

## 📝 HÀNH ĐỘNG TIẾP THEO

1. ✅ Revert về v6.0.7 (window.open + routes)
2. 🔄 Research Rancher modal/window manager API
3. 🔄 Test Option 2 (Event bus + inline modal)
4. 🔄 Document findings về `plugin.addRoute()` limitation

