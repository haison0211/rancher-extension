# 🚀 Hướng dẫn Setup Rancher Extension

## ✅ Đã hoàn thành

- [x] Cài đặt Node.js v20.20.0
- [x] Cài đặt Yarn v1.22.22
- [x] Tạo development app: `my-first-extension`
- [x] Cài đặt dependencies thành công

---

## 📁 Cấu trúc thư mục

```
my-first-extension/
├── .github/workflows/        # GitHub Actions workflows
├── pkg/
│   └── my-first-extension/   # Extension package của bạn
│       ├── index.ts          # Entry point
│       ├── models/           # Data models
│       ├── edit/             # Edit views
│       ├── list/             # List views
│       ├── detail/           # Detail views
│       └── l10n/             # Internationalization
├── package.json
├── vue.config.js
└── tsconfig.json
```

---

## 🔧 Các bước tiếp theo

### 1. Chạy Development Server

**⚠️ LƯU Ý QUAN TRỌNG:** Bạn cần có Rancher đang chạy trước khi start dev server!

```bash
# Thay <Rancher Backend URL> bằng URL Rancher của bạn
# Ví dụ: API=https://rancher.example.com yarn dev
API=<Rancher Backend URL> yarn dev
```

Server sẽ chạy tại: **https://127.0.0.1:8005**

### 2. Build Extension

```bash
# Build extension thành Vue library
yarn build-pkg my-first-extension
```

Extension được build sẽ nằm trong thư mục `dist-pkg/`

### 3. Test Extension với Developer Load

#### Bước 3.1: Serve Built Package
```bash
# Chạy web server để serve extension (port 4500)
yarn serve-pkgs
```

#### Bước 3.2: Enable Developer Features trong Rancher UI
1. Vào Rancher UI → Click avatar (góc trên bên phải)
2. Chọn **Preferences**
3. Trong **Advanced Features**, check ✅ **Enable Extension developer features**

#### Bước 3.3: Load Extension
1. Click hamburger menu (góc trên bên trái) → **Extensions**
2. Click menu 3 chấm → **Developer load**
3. Nhập Extension URL:
   ```
   https://127.0.0.1:8005/pkg/my-first-extension-0.1.0/my-first-extension-0.1.0.umd.min.js
   ```
4. Click **Load**

💡 **Tip:** Check "Persist extension by creating custom resource" để extension không mất khi reload trang.

---

## 📝 Tùy chỉnh Extension

### Ngăn extension tự động load trong dev mode

Sửa file `vue.config.js`:

```javascript
const config = require('@rancher/shell/vue.config');

module.exports = config(__dirname, {
  excludes: ['my-first-extension'],
});
```

---

## 🔗 Scripts có sẵn

```bash
# Development
yarn dev                            # Chạy dev server với hot-reload

# Build
yarn build                          # Build toàn bộ app
yarn build-pkg my-first-extension   # Build specific extension
yarn clean                          # Clean build artifacts

# Serve & Publish
yarn serve-pkgs                     # Serve built packages locally
yarn publish-pkgs                   # Publish packages
```

---

## 📚 Tài liệu tham khảo

- **Extensions API:** https://extensions.rancher.io/extensions/next/api/overview
- **Use Cases/Examples:** https://extensions.rancher.io/extensions/next/usecases/overview
- **Publishing Extensions:** https://extensions.rancher.io/extensions/next/publishing

---

## ⚠️ Prerequisites để chạy

1. **Rancher System:** Bạn cần có Rancher đang chạy
   - Xem hướng dẫn: https://ranchermanager.docs.rancher.com/getting-started/installation-and-upgrade
   
2. **Admin User:** Bạn cần quyền admin để test Extensions

3. **Node.js v20:** ✅ Đã cài
4. **Yarn:** ✅ Đã cài

---

## 🎯 Next Steps

1. **Setup Rancher** (nếu chưa có)
2. **Chạy dev server** với API URL của Rancher
3. **Học Extensions API** để customize extension
4. **Build và test** với Developer Load
5. **Release as Helm Chart** khi sẵn sàng deploy

---

Chúc bạn code vui vẻ! 🎉
