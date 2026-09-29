# rancher-node-filter 7.0.1: tính năng và cấu hình

Hỗ trợ Rancher 2.13.x, 2.14.x và 2.15.x (build trên `@rancher/shell` 3.0.8).

Giữ build trên shell 3.0.8 chừng nào còn cụm 2.13/2.14. Shell của 2.15 (3.0.12) gọi `forgetType` với tham số dạng object, mà 2.13/2.14 không hiểu dạng này, nên sẽ không dọn được dữ liệu cũ khi rời trang Nodes.

Tất cả số liệu CPU/RAM lấy thẳng từ `metrics.k8s.io`, tức cùng nguồn với `kubectl top`. Plugin không đọc qua cache của Rancher.

## Nguyên tắc

- Plugin **chỉ thêm** vào giao diện Rancher: cột, panel, action ở cuối menu, bộ lọc (mặc định tắt).
- Plugin **không** override model của Rancher, và **không** nạp pod vào store theo cách Rancher không làm.
- Ngoại lệ duy nhất: sửa phần **hiển thị** của một tính năng gốc khi nó cho số sai, gây sai lệch vận hành. Các chỗ sửa được liệt kê ở mục [Sửa hiển thị gốc](#sửa-hiển-thị-gốc).

## Tính năng

| # | Tính năng | Ở đâu | Nguồn dữ liệu | Refresh / cấu hình | Quyền cần có |
|---|---|---|---|---|---|
| 1 | Cột **CPU / RAM** của pod | Trang Pods (list gốc của Rancher, giữ phân trang server-side) | `metrics.k8s.io` theo namespace của các dòng đang hiển thị | 30s khi tab đang mở, dừng khi tab ẩn. ≤5 namespace thì gọi theo từng namespace, nhiều hơn thì gọi 1 lần cho cả cụm. CPU luôn là **vCPU, 3 chữ số thập phân** (`0.250 vCPU`; 0.001 vCPU = 1 millicore). RAM **dưới 1 GiB hiện MiB số nguyên** (`900 MiB`), **từ 1 GiB (1024 MiB) trở lên hiện GiB 2 chữ số** (`1.50 GiB`, `12.06 GiB`). Rê chuột để xem số MiB chính xác như `kubectl top` (`12,345 MiB`). Hiển thị chỉ là cách trình bày: sort luôn theo số byte thật, nên `900 MiB` luôn xếp dưới `1.50 GiB`. Làm tròn giống hệt `kubectl top`: CPU làm tròn lên tới millicore, RAM làm tròn xuống. Cột căn phải, chữ số cùng độ rộng. Pod Completed/Failed hiện `0.000 vCPU`/`0 MiB` màu mờ (không còn container chạy). Pod đang chạy nhưng metrics-server chưa lấy mẫu hiện `—`. **Không sort được** (server không có số liệu này), dùng panel Top pods | `list metrics.k8s.io/pods` (namespace hoặc cluster) |
| 2 | Panel **Top pods by live usage** | Phía trên trang Pods | Như (1), trong phạm vi namespace filter đang chọn | Mặc định thu gọn và **không gọi API khi thu gọn**. Top 20, sort theo CPU hoặc RAM. Trạng thái mở/đóng lưu ở localStorage `rancher-node-filter.top-pods-expanded` | như (1) |
| 3 | Action **Proxy HTTP** | Menu dòng của Pod (đang Running) và Service (có port, không phải ExternalName), cuối menu | k8s API proxy `…/pods|services/<name>:<port>/proxy/<path>` | Chỉ GET, timeout 10s, response tối đa 1 MB (phần dư bị cắt) | `get pods/proxy` hoặc `services/proxy` |
| 4 | Action **Shell** vào node | Menu dòng của Node (node Ready) và nút trên trang Node detail. Trên Rancher 2.15+, action và nút bị ẩn khi feature flag `node-shell` hoặc `pod-shell` tắt (backend chặn exec vào pod khi `pod-shell` tắt). Action "SSH Shell" gốc của Rancher chỉ dùng được cho node do Rancher tự tạo máy (node driver), nên node EKS vẫn cần action này | Pod privileged `nsenter` trong ns `node-shell` | Image `alpine:3.19`, hostPID/IPC/Network, `system-node-critical`. `activeDeadlineSeconds: 1800` (k8s tự kill sau 30 phút). Chờ Running tối đa 60s, poll 0.5s tăng dần tới 2s. Khi mở Shell thì dọn các shell pod đã Succeeded/Failed hoặc cũ hơn 30 phút | Một role cho phép create/get/delete pod và exec trong ns `node-shell` (`<node-shell-role>`) |
| 5 | **Lọc node theo label** (key/value) | Trang Nodes | Danh sách label lấy từ 1 request nhẹ (`/v1/nodes` bỏ spec/status) | Khớp **chính xác**. Có SQL cache (vai) thì lọc server-side bằng `labelSelector`, không thì lọc client-side. Ẩn các label hệ thống (`beta.kubernetes.io/*`, `node.kubernetes.io/*`, `kubernetes.io/arch|hostname|os`). Option làm mới khi cũ hơn 60s | `list nodes` |
| 6 | Cột **Disk %** của node | Trang Nodes (sau cột RAM) | Prometheus: `max by (instance)((1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100)`, map theo IP nội bộ của node | 60s, dừng khi tab ẩn. Endpoint dạng `<namespace>/services/<prometheus-service>:<port>`, mặc định lấy từ `DEFAULT_ENDPOINT` trong `utils/prometheus-config.js`, đổi bằng nút **Settings** (lưu ở localStorage `rancher-node-filter.prometheus-endpoint`, có hiệu lực ngay). Gặp 403 thì tắt trong phiên và hiện banner. Không có Prometheus thì hiện N/A | `get services/proxy` trên service Prometheus |
| 7 | Cột **CPU / RAM** của pod trong tab Pods ở Node detail | Trang Node detail | Như (1), cho mọi namespace có pod trên node | 30s. **Sort được** theo đúng số (millicores / bytes) | như (1) |

**Quy tắc chung của mọi luồng metrics** (`services/metrics-store.ts`):

- Chỉ poll khi có thành phần đang hiển thị cần số liệu và tab trình duyệt đang mở.
- Mỗi loại chỉ có 1 request tại một thời điểm.
- Dữ liệu cũ hơn chu kỳ thì refresh ngay khi quay lại tab.
- Lỗi thì giãn chu kỳ gấp đôi mỗi lần, tối đa 5 phút.
- Đợi 5s sau khi thành phần cuối cùng biến mất mới dừng hẳn, để tránh bật/tắt liên tục khi bảng render lại.
- **Không bao giờ hiển thị số cũ như số hiện tại:** dữ liệu cũ hơn 2 chu kỳ (60s với CPU/RAM, 120s với disk), ví dụ khi quay lại trang sau vài phút, được coi như chưa có. UI hiện spinner hoặc N/A cho tới khi có mẫu mới, thường dưới 1s.

## Sửa hiển thị gốc

| Chỗ sửa | Rancher gốc hiển thị | Vì sao sai | Plugin hiển thị |
|---|---|---|---|
| Cột **CPU / RAM** ở trang Nodes | CPU: `usage / allocatable`. RAM: `usage / capacity`. Usage lấy từ `metrics.k8s.io.nodes` qua steve | (a) RAM chia cho **capacity** ở list nhưng chia cho **allocatable** ở trang detail, nên hai trang lệch nhau. (b) List lấy metrics qua collection của steve. Khi bật vai, collection này đọc từ SQL cache, mà `metrics.k8s.io` không có watch nên cache có thể cũ nhiều ngày (xem `RANCHER-METRICS-CACHE-BUG.md`, ví dụ 0.57% trong khi thực tế 28%). (c) Cụm `cattle.io/creator=norman` + driver `eks` dùng *tổng request* thay cho usage | `usage / allocatable` lấy raw từ `metrics.k8s.io`, giống `kubectl top nodes` và giống trang detail. Giữ nguyên tên cột, vị trí, định dạng. Sort (khi list không phân trang) theo đúng số hiển thị và sort lại mỗi khi số liệu mới về |
| Gauge **CPU / RAM** ở Node detail | Usage qua steve (`find` theo id) | Khác nguồn và khác cách tính so với trang list | Cùng nguồn và cùng công thức với list. Trong lúc chờ số liệu đầu tiên thì hiện spinner, thay vì hiện 0% |
| Rời trang **Node detail** | Pod đã nạp vẫn nằm trong store | Ở cụm không bật vai, nếu đi Deployment → Node detail → quay lại Deployment đó, Rancher liệt kê mọi pod trong store là pod của Deployment | Xoá pod khỏi store khi rời trang (`forgetType(POD)`), giống trang Nodes gốc. Không làm sai dữ liệu. Ở cụm không bật vai, trang cần pod tiếp theo sẽ tải lại danh sách pod |

Cột **Pods** ở trang Nodes và tab **Pods** ở Node detail giữ nguyên cơ chế gốc của Rancher: nạp vào store, cập nhật live qua websocket (khi bật vai có debounce khoảng 4s).

## Hạn chế đã biết

- **Trang Nodes và Node detail là bản copy** của `shell/list/node.vue` và `shell/detail/node.vue` (đã so khớp với Rancher 2.13.1, 2.14.3 và 2.15.2). Khi nâng Rancher phải diff lại, nếu không tính năng gốc mới của các trang này sẽ không hiện.
- **Cluster Dashboard gốc** vẫn đọc CPU/RAM qua cache của steve, nên có thể bị cũ như lỗi (b). Plugin không thay trang này.
- **Kích thước lazy chunk:** trang Nodes / Node detail tải thêm khoảng 540 KB (bản copy bảng của Rancher được đóng gói vào plugin, đã cắt những phần không bao giờ dùng, xem `pkg/rancher-node-filter/vue.config.js`); dialog Proxy khoảng 135 KB. Các chunk này chỉ tải khi mở đúng trang hoặc dialog.
- **Rancher trả file plugin không nén và không cho trình duyệt cache**, nên mỗi lần F5 trên trang Nodes đều tải lại khoảng 540 KB. Muốn xoá nốt phần này phải cấu hình ở Kong (xem mục [F5 và cache](#f5-và-cache)).
- **Số liệu metrics-server** là giá trị lấy mẫu trung bình trên một cửa sổ (thường 15–60s). "Khớp `kubectl top`" nghĩa là khớp khi đo cùng thời điểm.

## Bundle

| File | 6.2.1 | 7.0.0 | Khi nào tải |
|---|---|---|---|
| Entry `…umd.min.js` | 853 KB | ~7 KB | Mọi lần load / F5 (**chặn** UI tới khi tải xong) |
| Trang Pods (formatter + panel) | nằm trong entry | ~32 KB (gzip 13 KB) | Khi mở trang Pods, không chặn bảng gốc |
| Trang Nodes / Node detail | ~280 KB + 853 KB entry = ~1.1 MB | ~540 KB (gzip ~160 KB) | Khi mở trang Nodes / Node detail |
| Dialog Proxy HTTP | nằm trong entry | ~135 KB | Khi bấm Proxy HTTP |

CI (`.github/workflows/bundle-size.yml`) sẽ fail nếu entry vượt 60 KB, và bước release chart phải chờ bước kiểm tra này.

**Những phần đã cắt khỏi chunk trang Node** (`pkg/rancher-node-filter/vue.config.js`, chỉ áp dụng cho bản build release):

| Phần bị cắt | Tiết kiệm | Vì sao an toàn |
|---|---|---|
| `FileDiff` (diff + diff2html + highlight.js) | ~300 KB | Màn so sánh YAML của Rancher. Trên trang của plugin YAML chỉ hiển thị read-only; Edit YAML luôn mở trang gốc của Rancher |
| `lodash` → `lodash-es` | ~90 KB | Mọi import lodash trong shell đều là named import, nên chỉ giữ đúng các hàm được dùng |
| `cronstrue` | ~20 KB | Chỉ phục vụ form CronJob |
| Polyfill `console` | ~30 KB | Trình duyệt có sẵn `console` |

## F5 và cache

- Plugin đã loại bỏ phần chặn F5 trên **mọi trang**: entry 7 KB thay cho 853 KB.
- **Trang Nodes / Node detail** vẫn phải tải khoảng 540 KB mỗi lần F5. Lý do nằm ở Rancher: file plugin được phục vụ bằng `http.FileServer`, không nén, và trả về kèm `Cache-Control: no-store`.
- Có thể xoá nốt phần này bằng cấu hình Kong (cần duyệt vì là thay đổi hạ tầng):
  - **Đổi header cache** cho đường dẫn `/v1/uiplugins/<name>/<version>/plugin/*` sang `Cache-Control: no-cache` (bỏ `no-store`). Trình duyệt sẽ lưu file lại, và mỗi lần F5 chỉ hỏi lại server bằng `If-Modified-Since`, nhận về 304 **không có body**. Cách này vẫn đúng tuyệt đối khi publish lại cùng số version, vì Rancher đổi `Last-Modified` mỗi lần cache lại plugin.
  - **Nén gzip** ở Kong: ~540 KB → ~160 KB.

## So sánh cấu hình 6.2.1 → 7.0.0

| Hạng mục | 6.2.1 | 7.0.0 |
|---|---|---|
| Metrics pod (trang Pods) | Toàn cụm; 30s khi tab mở, 60s khi ẩn; gọi thêm mỗi khi số pod đổi (throttle 2s); tải **toàn bộ pod** (tắt phân trang) | Theo namespace đang hiển thị; 30s; dừng khi ẩn; list gốc có phân trang |
| Metrics node | Cache 25s ở mức module + metric poller 30s, hardcode cluster `local` | 30s, theo cluster hiện tại, dùng chung một nguồn cho list và detail |
| Disk | Cache 25s; probe `query=up` mỗi 5 phút; lỗi không backoff | 60s; không probe; backoff; 403 thì dừng |
| Node detail | 2 poller 30s, metrics pod toàn cụm | 1 luồng pod metrics theo namespace + 1 luồng node metrics |
| Dọn shell pod | Mọi tab, mỗi 5 phút, `findAll pod` toàn cụm (**gây lỗi Deployment**) | Chỉ khi mở Shell, 1 request trong ns `node-shell` |
| Đơn vị CPU / RAM pod | `0.25 vCPU` (2 chữ số, có thể hiện 0.00); `MiB` rồi đổi sang `GiB` khi ≥ 1024 MiB | `0.250 vCPU` (3 chữ số, làm tròn lên như kubectl); `< 1 GiB`: `900 MiB`; `≥ 1 GiB`: `12.06 GiB`; MiB chính xác ở tooltip; **sort theo số byte** (6.2.1 cũng đổi đơn vị nhưng sort sai). Gauge CPU ở Node detail cũng hiện vCPU 3 chữ số |
