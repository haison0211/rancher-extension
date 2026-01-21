# 🧪 Hướng dẫn Test Hello World Extension

## ✅ Đã tạo xong

- [x] `product.ts` - Định nghĩa product trong Rancher
- [x] `routing/extension-routing.ts` - Định nghĩa routes
- [x] `pages/HelloWorld.vue` - Component Hello World
- [x] `index.ts` - Entry point đã được cập nhật

---

## 🎯 Cách 1: Test trong Dev Mode (Hot Reload)

### Bước 1: Chạy Dev Server

```bash
# Trong thư mục my-first-extension
API=https://rancher.selless.dev yarn dev
```

**Lưu ý:** Thay `https://rancher.selless.dev` bằng URL Rancher của bạn nếu khác.

### Bước 2: Mở trình duyệt

Truy cập: **https://127.0.0.1:8005**

### Bước 3: Tìm extension trong menu

1. Đăng nhập vào Rancher (cần quyền admin)
2. Nhìn vào **navigation menu bên trái**
3. Bạn sẽ thấy item mới với icon 🌐 (globe)
4. Click vào để xem trang Hello World!

### Kết quả mong đợi:

✅ Trang Hello World hiển thị với:
- Tiêu đề "🎉 Hello World!"
- Thông tin extension
- Đồng hồ real-time
- Button click counter
- Tips cho bước tiếp theo

---

## 🎯 Cách 2: Test với Developer Load (Build + Serve)

### Bước 1: Build Extension

```bash
yarn build-pkg my-first-extension
```

**Output:** File sẽ được tạo trong `dist-pkg/my-first-extension-0.1.0/`

### Bước 2: Serve Extension Locally

```bash
yarn serve-pkgs
```

**Output mẫu:**
```
Serving catalog on http://127.0.0.1:4500
Serving packages:
  my-first-extension-0.1.0 available at: http://127.0.0.1:4500/my-first-extension-0.1.0/my-first-extension-0.1.0.umd.min.js
```

### Bước 3: Enable Developer Features trong Rancher

1. Mở Rancher UI
2. Click **avatar** (góc trên bên phải)
3. Chọn **Preferences**
4. Scroll xuống **Advanced Features**
5. Check ✅ **Enable Extension developer features**
6. Click **Save**

### Bước 4: Developer Load Extension

1. Click **hamburger menu** (☰ góc trên trái)
2. Click **Extensions**
3. Click **menu 3 chấm** (⋮) góc trên phải
4. Chọn **Developer load**

### Bước 5: Nhập Extension URL

Trong dialog hiện ra, nhập:

```
http://127.0.0.1:4500/my-first-extension-0.1.0/my-first-extension-0.1.0.umd.min.js
```

**Lưu ý:** 
- Dùng `http://` không phải `https://`
- Port là `4500` (của yarn serve-pkgs)

### Bước 6: Load Extension

1. Click **Load**
2. Đợi notification "Extension loaded successfully"
3. Kiểm tra menu bên trái - icon 🌐 sẽ xuất hiện

**💡 Tip:** Check ☑️ "Persist extension by creating custom resource" nếu bạn muốn extension không bị mất khi reload page.

### Bước 7: Test Extension

Click vào icon 🌐 trong menu → Trang Hello World sẽ hiển thị!

---

## 🔧 Giải thích chi tiết các bước

### **Tại sao cần Build?**

- Dev mode: Code chạy trực tiếp từ source, có hot-reload
- Build mode: Code được compile thành `.umd.min.js` (Universal Module Definition)
- UMD format cho phép Rancher load extension như một module độc lập

### **Tại sao cần Serve?**

- Extension cần được serve qua HTTP để Rancher có thể fetch
- `yarn serve-pkgs` tạo một static file server đơn giản
- Mặc định chạy ở port 4500

### **Developer Load là gì?**

- Cách nhanh để test extension mà không cần deploy
- Extension được load động vào Rancher UI
- **Không persistent** (mất khi reload) trừ khi check "Persist" option

---

## 🐛 Troubleshooting

### Extension không xuất hiện trong menu?

1. Kiểm tra dev server đang chạy: `https://localhost:8005`
2. Check browser console có error không
3. Đảm bảo bạn đã login với quyền admin
4. Hard refresh: `Cmd + Shift + R` (Mac) hoặc `Ctrl + Shift + R` (Win)

### Build lỗi?

```bash
# Clean và rebuild
yarn clean
yarn install
yarn build-pkg my-first-extension
```

### Serve-pkgs không chạy?

```bash
# Kiểm tra port 4500 có bị chiếm không
lsof -i :4500

# Kill process nếu cần
kill -9 <PID>
```

### Developer Load không work?

1. Đảm bảo đã enable "Extension developer features"
2. Check URL chính xác: `http://127.0.0.1:4500/...`
3. Kiểm tra `yarn serve-pkgs` đang chạy
4. Xem browser Network tab xem có fetch được file không

---

## 📊 So sánh 2 cách test

| Tiêu chí | Dev Mode | Developer Load |
|----------|----------|----------------|
| **Hot Reload** | ✅ Có | ❌ Không |
| **Build cần thiết** | ❌ Không | ✅ Có |
| **Serve cần thiết** | ❌ Không | ✅ Có |
| **Tốc độ** | 🚀 Nhanh | 🐢 Chậm hơn |
| **Use case** | Development | Test như production |
| **Persistent** | ✅ Luôn có | ⚠️ Tùy chọn |

**💡 Khuyến nghị:** 
- Dùng **Dev Mode** khi đang code
- Dùng **Developer Load** khi muốn test như production

---

## ✨ Các tính năng của Hello World Extension

1. **🎨 Giao diện đẹp**: Gradient background, card design
2. **⏰ Real-time clock**: Cập nhật mỗi giây
3. **👆 Interactive button**: Click counter với notification
4. **📋 Extension info**: Hiển thị metadata
5. **💡 Tips**: Hướng dẫn bước tiếp theo

---

## 🎓 Bước tiếp theo

### Customize Extension:

1. **Đổi tên product:**
   - Edit `YOUR_PRODUCT_NAME` trong `product.ts` và `extension-routing.ts`
   - Đổi `icon` thành icon khác (xem [icons](https://rancher.github.io/icons/))

2. **Thêm page mới:**
   - Tạo component trong `pages/`
   - Thêm route trong `extension-routing.ts`

3. **Thêm data models:**
   - Tạo model trong `models/`
   - Tạo list view trong `list/`
   - Tạo edit view trong `edit/`

4. **Internationalization:**
   - Thêm translations trong `l10n/`

### Tài liệu:

- **Extensions API:** https://extensions.rancher.io/extensions/next/api/overview
- **Use Cases:** https://extensions.rancher.io/extensions/next/usecases/overview
- **Components:** https://rancher.github.io/dashboard/

---

## 🎉 Chúc mừng!

Bạn đã tạo và test thành công Rancher Extension đầu tiên! 🚀

Có câu hỏi? Tham khảo docs hoặc check source code của extension có sẵn.
