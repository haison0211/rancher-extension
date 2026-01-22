# 🔍 Rancher Node Filter Extension

Extension này mở rộng **Node Explorer** trong Rancher Dashboard để thêm khả năng **filter nodes theo labels**.

## ✨ Features

- ✅ **Label Key Dropdown**: Dropdown list chứa tất cả label keys có sẵn từ các nodes
- ✅ **Label Value Filter**: Text field để nhập label value cần tìm
- ✅ **Real-time Filtering**: Lọc ngay lập tức khi nhập
- ✅ **Partial Match**: Hỗ trợ tìm kiếm partial string (contains)
- ✅ **Clear Filter**: Button để clear filter và hiển thị lại tất cả nodes
- ✅ **Filter Info**: Hiển thị số lượng nodes được tìm thấy
- ✅ **Smart Label Keys**: Tự động loại bỏ các system labels để UX sạch hơn
- ✅ **Preserve Features**: Giữ nguyên sort, pagination, và tất cả features mặc định

## 📍 Sử dụng

### 1. Node Explorer
**URL**: `/c/local/explorer/node`

Filter được thêm vào trên Node list:
1. **Chọn Label Key**: Dropdown hiển thị tất cả label keys có sẵn
2. **Nhập Label Value**: Nhập text để filter (case-insensitive, partial match)
3. **View Results**: Table tự động filter để chỉ hiển thị matching nodes
4. **Clear**: Click "Clear Filter" để reset

### Ví dụ:
- Filter nodes có label `environment=production`
- Filter nodes có label `region` chứa text `us-west`
- Filter nodes có label `node-type` chứa text `worker`

## 🏗️ Kiến trúc

### 1. **Component Override**
```typescript
plugin.register('list', 'node', () => import('./list/node.vue'));
```
- Override Node list component
- Extend với custom filter UI và logic
- Giữ nguyên toàn bộ features mặc định

### 2. **Client-side Filtering**
- Lọc dựa trên `metadata.labels` của node
- Không modify API request
- Compatible với pagination và sort

### 3. **Dynamic Label Keys**
```typescript
labelKeyOptions() {
  const allNodes = this.$store.getters['cluster/all'](this.resource);
  // Extract all unique label keys from nodes
  // Filter out system labels
  return uniqueLabelKeys;
}
```

### 4. **Filtering Logic**
```typescript
filteredRows() {
  return nodes.filter(node => {
    const labelValue = node.metadata.labels[selectedKey];
    return labelValue?.toLowerCase().includes(searchValue);
  });
}
```

## 📁 Cấu trúc Files

```
pkg/rancher-node-filter/
├── index.ts                    # Entry point - register list component
├── package.json                # Extension metadata
├── list/
│   └── node.vue                # Custom Node list với label filter
└── l10n/
    └── en-us.yaml              # i18n strings
```

## 🔑 Key Components

### 1. **List Component** (`list/node.vue`)

Vue component override cho Node list:
```vue
<template>
  <div>
    <!-- Custom Label Filter UI -->
    <div class="label-filter-section">
      <LabeledSelect v-model="selectedLabelKey" :options="labelKeyOptions" />
      <input v-model="labelValue" :disabled="!selectedLabelKey" />
      <button @click="clearLabelFilter">Clear</button>
    </div>
    
    <!-- Original PaginatedResourceTable with filtered rows -->
    <PaginatedResourceTable :rows="filteredRows" ... />
  </div>
</template>
```

**Features:**
- Extract label keys từ tất cả nodes
- Filter out system labels (kubernetes.io/*, beta.kubernetes.io/*, node.kubernetes.io/*)
- Client-side filtering với partial string match
- Display số lượng nodes found

### 2. **Localization** (`l10n/en-us.yaml`)

Định nghĩa i18n strings:
```yaml
node:
  list:
    labelFilter:
      labelKey: "Label Key"
      selectLabelKey: "Select a label key..."
      labelValuePlaceholder: "Enter label value to filter..."
      clear: "Clear Filter"
      filteringBy: "Filtering by {key} contains '{value}' - {count} node(s) found"
```

### 3. **Entry Point** (`index.ts`)

Register list component override:
```typescript
export default function(plugin: IPlugin): void {
  importTypes(plugin);
  plugin.metadata = require('./package.json');
  
  // Override Node list component
  plugin.register('list', 'node', () => import('./list/node.vue'));
}
```

## 🚀 Build & Deploy

### Build Extension
```bash
# Từ root của workspace
cd /Users/admin/Documents/rancher-extension/rancher-extension

# Build extension
yarn build-pkg rancher-node-filter
```

Output sẽ ở: `dist-pkg/rancher-node-filter-1.0.0/rancher-node-filter-1.0.0.tgz`

### Deploy to Rancher

1. **Upload via UI**:
   - Vào Rancher UI → **Extensions** → **Available** tab
   - Click **⋮** → **Install from File**
   - Upload file `.tgz`

2. **Reload Page**:
   - Sau khi install, reload browser
   - Vào `/c/local/explorer/node`
   - Sẽ thấy filter section mới

## ⚙️ Requirements

- Rancher ≥ v2.8.0
- Node.js ≥ 16
- Cluster đang chạy bình thường
- Permission để view nodes (`/v1/nodes`)

## 🔍 How it Works

### Flow:

1. **Extension Load**:
   ```
   Rancher loads extension → Register list override → Load custom node.vue
   ```

2. **Label Keys Extraction**:
   ```typescript
   // Get all nodes from store
   const allNodes = this.$store.getters['cluster/all'](NODE);
   
   // Extract unique label keys
   allNodes.forEach(node => {
     Object.keys(node.metadata.labels).forEach(key => {
       if (!isSystemLabel(key)) labelKeys.add(key);
     });
   });
   ```

3. **Filtering**:
   ```typescript
   // When user selects label key + enters value
   filteredRows = nodes.filter(node => {
     const labelValue = node.metadata.labels[selectedKey];
     return labelValue?.toLowerCase().includes(searchValue.toLowerCase());
   });
   ```

4. **Render**:
   ```vue
   <PaginatedResourceTable :rows="filteredRows" />
   ```

## 🎯 Design Decisions

### ✅ Client-side Filtering
**Why?** 
- Không cần modify Steve API requests
- Simpler implementation
- Works với existing pagination

**Trade-off:**
- Chỉ filter trong current page nếu pagination enabled
- OK cho most use cases (100 nodes per page)

### ✅ Filter Out System Labels
**Why?**
- Cleaner UX
- User thường chỉ quan tâm custom labels
- System labels như `kubernetes.io/arch` ít khi cần filter

**Labels filtered:**
- `beta.kubernetes.io/*`
- `node.kubernetes.io/*`
- `kubernetes.io/arch`
- `kubernetes.io/hostname`
- `kubernetes.io/os`

### ✅ Partial String Match
**Why?**
- More flexible than exact match
- Users can type part of value
- Case-insensitive for better UX

## 📖 Rancher Extension APIs Sử dụng

| API | Mục đích |
|-----|----------|
| `plugin.register('list', 'node', ...)` | Override Node list component |
| `importTypes(plugin)` | Auto-import các components từ folders |
| `PaginatedResourceTable` | Base table component của Rancher |
| `LabeledSelect` | Rancher's select component |
| `$store.getters['cluster/all']` | Lấy Node resources |
| `t('key')` | i18n translation |

## 🐛 Troubleshooting

### Filter không hoạt động?
- ✅ Check nodes có labels chưa: `kubectl get nodes --show-labels`
- ✅ Verify extension đã load: F12 → Console → check errors
- ✅ Clear browser cache và reload

### Dropdown rỗng?
- ✅ Nodes phải có custom labels (không chỉ system labels)
- ✅ Check permission: user phải có quyền view nodes

### Filter chậm?
- ✅ Normal với >1000 nodes trong 1 page
- ✅ Consider enable server-side pagination

## 🎓 Extending Further

### Add Server-side Filtering

Để support filtering cho large clusters (>1000 nodes):

```typescript
// Modify API request để include label filter
const opt: ActionFindPageArgs = {
  pagination: new FilterArgs({
    filters: new PaginationParamFilter({
      fields: [
        new PaginationFilterField({
          field: `metadata.labels.${selectedKey}`,
          value: labelValue
        })
      ]
    })
  })
};

await this.$store.dispatch('cluster/findPage', { type: NODE, opt });
```

**Note:** Requires understanding Steve API label filter syntax.

### Add Multiple Label Filters

Extend UI to support filtering by multiple labels simultaneously:
```typescript
labelFilters: [
  { key: 'environment', value: 'prod' },
  { key: 'region', value: 'us-west' }
]
```

### Add Label Value Autocomplete

Extract all values for selected label key:
```typescript
labelValueOptions() {
  return nodes
    .map(n => n.metadata.labels[selectedKey])
    .filter(Boolean)
    .unique();
}
```

## 📝 License

MIT

## 🤝 Contributing

PRs welcome!

## 📚 References

- [Rancher Dashboard Extensions](https://rancher.github.io/dashboard/extensions/introduction)
- [Steve API Documentation](https://github.com/rancher/steve)
- [Kubernetes Node Labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)
