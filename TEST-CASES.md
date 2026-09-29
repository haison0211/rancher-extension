# rancher-node-filter 7.0.1: test case

Chạy trên các phiên bản Rancher 2.13.x (`<cluster-2.13>`), 2.14.x (`<cluster-2.14>`) và 2.15.x (`<cluster-2.15>`). Với mỗi cụm, ghi lại trạng thái SQL cache (vai):
`kubectl get features.management.cattle.io ui-sql-cache -o jsonpath='{.status.default} {.spec.value}'`

**Tài khoản test:** admin và một user có role project-scoped (`<project-role>`).

**Baseline:** để so sánh "giữ nguyên tính năng gốc", disable extension (Extensions → rancher-node-filter → Disable), ghi lại kết quả, rồi bật lại và so sánh.

Cột Kết quả: `Pass` / `Fail` / `N/A`, kèm ghi chú.

## A. Giữ nguyên tính năng gốc của Rancher

| ID | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| A1 | Trang Pods: so sánh cột, thứ tự cột, search, phân trang, sort từng cột gốc với baseline | Giống hệt. Chỉ thêm 2 cột CPU, RAM và panel Top pods (đang thu gọn) | |
| A2 | Trang Pods: DevTools → Network khi load trang | Request list pod giống baseline (có vai thì `page=…&pagesize=…`). **Không** có `/v1/pods?pagesize=100000` | |
| A3 | Trang Services: cột, sort, search, phân trang | Giống baseline | |
| A4 | Trang Nodes: cột Pods. Tạo 1 pod gắn vào một node (`kubectl run t --image=busybox --overrides='{"spec":{"nodeName":"<node>"}}' -- sleep 600`), rồi xoá | Số pod của node tăng rồi giảm **mà không cần F5**, trong khoảng ≤5s, giống baseline | |
| A5 | Trang Nodes: sort các cột gốc (State, Name, Roles, Version, Age, Pods) khi list không phân trang | Giống baseline | |
| A6 | Trang Nodes: sub-row taints/labels, "Show more labels", banner Windows (nếu có), search, phân trang | Giống baseline | |
| A7 | Menu dòng của Pod / Service / Node | Mọi action gốc giữ nguyên thứ tự. Proxy HTTP / Shell chỉ xuất hiện ở **cuối**, sau divider | |
| A8 | Node detail: các tab Pods / Metrics (nếu có Grafana) / Info / Images / Taints và các alert | Giống baseline | |
| A9 | Deployment / StatefulSet / DaemonSet / Job detail: gauge, tab Pods, Services, Ingresses | Giống baseline | |
| A10 | Cordon / Drain / Edit / Delete node từ list, và menu ⋮ của từng dòng | Hoạt động như baseline | |
| A11 | **Bản build release** (cách 2 / cài thật, không phải `yarn dev`): trang Nodes → một dòng → Show Configuration (drawer) → tab YAML | Hiển thị YAML bình thường. Edit YAML mở trang gốc của Rancher, diff hoạt động (kiểm tra phần đã cắt FileDiff) | |
| A12 | Node detail: gauge Pods | 2.15+: `Running 12 of 110 Pods`; 2.13/2.14: `Used 12 of 110 Pods`, giống baseline | |

## B. CPU / RAM của pod (bug: 2 đơn vị, sort sai)

| ID | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| B1 | Trang Pods, lọc 1 namespace có pod dùng > 10 GiB, 1–10 GiB và < 1 GiB RAM | Dưới 1 GiB: MiB số nguyên, không có dấu phẩy (`900 MiB`, `1023 MiB`). Từ 1024 MiB: GiB 2 chữ số (`1.00 GiB`, `1.50 GiB`, `12.06 GiB`). Rê chuột thấy số MiB chính xác (`12,345 MiB`). **Mọi** dòng CPU là vCPU 3 chữ số (`1.250 vCPU`, `0.012 vCPU`), không có `m`. Số căn phải, thẳng hàng | |
| B2 | So với `kubectl top pods -n <ns>` chạy cùng lúc | Từng pod khớp số: kubectl `Xm` = `X/1000 vCPU` (ví dụ `250m` = `0.250 vCPU`, `1m` = `0.001 vCPU`); kubectl `YMi` = tooltip `Y MiB`, ô hiển thị `Y MiB` khi Y < 1024, hoặc `Y/1024` GiB làm tròn 2 chữ số khi Y ≥ 1024 (ví dụ `900Mi` → `900 MiB`, `12345Mi` → `12.06 GiB`). Pod có usage rất nhỏ hiện `0.001 vCPU`, không phải `0.000`. Lệch tối đa 1 chu kỳ lấy mẫu | |
| B3 | Pod nhiều container | Bằng tổng các container (`kubectl top pods --containers` cộng lại) | |
| B4 | Pod Completed / Failed | Hiện `0.000 vCPU` / `0 MiB` màu mờ, tooltip "no running container" | |
| B4b | Pod Pending hoặc vừa chuyển Running (< 60s) | Hiện `—`, tooltip giải thích chưa có mẫu. Sau tối đa 1 chu kỳ thì có số | |
| B5 | Header CPU / RAM ở trang Pods | Không có mũi tên sort, bấm vào không làm gì | |
| B6 | Mở panel Top pods, chọn RAM | Xếp giảm dần theo số thật, bất kể đơn vị: `12.06 GiB` > `2.00 GiB` > `1.50 GiB` > `1.00 GiB` > `1023 MiB` > `900 MiB` > `9 MiB`. Hai pod cùng hiện `1.50 GiB` nhưng khác vài MiB vẫn xếp theo byte thật (6.2.1 sai ở đây vì so chuỗi "1.50 GiB" với "900 MiB") | |
| B7 | Panel Top pods, chọn CPU | `1.250 vCPU` đứng trên `0.950 vCPU` | |
| B7b | Node detail: gauge CPU | Dạng `0.450 of 1.930 vCPU`; phần trăm khớp cột CPU ở trang Nodes | |
| B8 | Panel Top pods khi namespace filter là 1 namespace | Chỉ có pod của namespace đó | |
| B9 | Node detail → tab Pods → sort RAM tăng rồi giảm, sau đó sort CPU | Thứ tự đúng theo số. Pod Completed (0) xếp trên pod `—` (chưa có mẫu), cả hai nằm cuối khi sort giảm dần | |
| B10 | Để yên Node detail đang sort theo CPU trong 2 phút khi usage thay đổi | Thứ tự tự cập nhật theo số mới (khoảng mỗi 30s), không giữ thứ tự cũ | |
| B11 | User `<project-role>` xem pod trong namespace của project | Hiện số liệu. Namespace không có quyền metrics thì hiện `—` với tooltip "No permission…", không spinner mãi | |
| B11b | Mở trang Pods, sang trang khác 5 phút, rồi quay lại | Không thấy số cũ: ô hiện spinner rất ngắn rồi có số mới (dữ liệu > 60s bị coi là chưa có) | |
| B12 | Tắt metrics-server (hoặc cụm không có) | Hiện `—` với tooltip lỗi, không spinner mãi. Request retry giãn dần (30→60→120→…→300s) | |

## C. CPU / RAM của node (sửa hiển thị gốc)

| ID | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| C1 | Trang Nodes so với `kubectl top nodes` cùng lúc | Cột CPU, RAM, Disk **có số** (không n/a). CPU% và RAM% từng node khớp (kubectl làm tròn xuống số nguyên, UI hiển thị theo PercentageBar; sai số ≤ 1 chu kỳ lấy mẫu) | |
| C2 | Mở Node detail của cùng node | Gauge CPU/RAM cho **cùng %** với trang list (6.2.1 và Rancher gốc lệch nhau) | |
| C3 | Trang Nodes không phân trang: sort CPU rồi RAM | Thứ tự đúng theo số đang hiển thị | |
| C4 | Để yên 2 phút khi đang sort CPU | Thứ tự cập nhật theo số mới | |
| C5 | Trang Nodes có phân trang (vai) | Cột CPU/RAM không sort được, giống Rancher gốc | |
| C6 | Kiểm tra lỗi cache cũ: so sánh `timestamp` của `/v1/metrics.k8s.io.nodes` (steve) với `/k8s/clusters/local/apis/metrics.k8s.io/v1beta1/nodes` (raw) | Ghi lại độ lệch. Plugin phải hiển thị theo bản **raw** | |
| C7 | Mở Node detail, trước khi metrics về | Gauge CPU/RAM hiện spinner, không hiện 0% | |
| C8 | Cụm có label `cattle.io/creator=norman` và driver `eks` (nếu có) | Số liệu vẫn là usage thật, không phải tổng request | |

## D. Disk %

| ID | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| D1 | So với query Prometheus `max by (instance)((1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100)` | Khớp theo IP nội bộ của node | |
| D2 | Endpoint sai / không có Prometheus | Cột hiện N/A. Request giãn dần tới 5 phút, không dồn dập | |
| D3 | User không có quyền `services/proxy` | Banner cảnh báo hiện **1 lần**, sau đó không còn request disk | |
| D4 | Đổi endpoint trong Settings rồi Save | Refresh ngay theo endpoint mới, không phải chờ | |
| D5 | Node có nhiều series cho mountpoint `/` | Một giá trị duy nhất (max) | |

## E. Lọc node theo label

| ID | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| E1 | Chọn key có `.` và `/` (ví dụ `eks.amazonaws.com/nodegroup`) | Lọc đúng | |
| E2 | Có value `spot` và `spot-large`, chọn `spot` | Chỉ các node có đúng `spot` (so khớp chính xác) | |
| E3 | Cụm có vai: DevTools → Network | Request node có `filter=metadata.labels[<key>] IN (<value>)`; kết quả khớp `kubectl get nodes -l <key>=<value>` | |
| E4 | Dòng "Filtering by … – N node(s)" | N = `kubectl get nodes -l <key>=<value> --no-headers \| wc -l` | |
| E5 | Đang ở trang 2 thì bật filter; sau đó bấm Clear | Quay về trang 1; clear xong list giống lúc chưa lọc | |
| E6 | Dropdown key | Không có label hệ thống (`kubernetes.io/hostname`, `node.kubernetes.io/*`…) | |

## F. Proxy HTTP

| ID | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| F1 | Pod Running → Proxy HTTP → chọn port → Execute | Hiện status, content-type, body | |
| F2 | Service ExternalName / Service không có port | Action bị disable | |
| F3 | Custom port, path có query và ký tự đặc biệt (`/a b?x=1`) | URL được encode đúng, gọi thành công | |
| F4 | Endpoint trả > 1 MB | Có cảnh báo bị cắt, hiển thị 1 MB đầu | |
| F5 | Endpoint treo | Báo timeout sau 10s | |
| F6 | Endpoint trả 404 / 500 | Hiện status và body, không crash | |
| F7 | Copy URL | URL đầy đủ `…/k8s/clusters/<id>/api/v1/namespaces/<ns>/<pods|services>/<name>:<port>/proxy/<path>` | |
| F8 | User không có quyền proxy | Hiện lỗi 403 rõ ràng | |

## G. Shell vào node

| ID | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| G1 | Node Ready → Shell (từ list và từ nút ở detail) | Mở terminal root trên node trong ≤60s | |
| G2 | Node NotReady | Action / nút bị disable | |
| G3 | `kubectl -n node-shell get pod <shell> -o jsonpath='{.spec.activeDeadlineSeconds}'` | `1800`. Sau 30 phút pod chuyển Failed (DeadlineExceeded) | |
| G4 | Có shell pod cũ > 30 phút / Completed, rồi mở Shell mới | Các pod cũ bị xoá | |
| G5 | User không có `<node-shell-role>` | Thông báo rõ cần role đó | |
| G6 | Sau khi mở Shell, vào một Deployment | Số pod của Deployment đúng (Shell không nạp pod vào store) | |
| G7 | Rancher 2.15+: Global Settings → Feature Flags, tắt `node-shell`, sau đó F5 trang Nodes và Node detail. Làm lại với `pod-shell` | Action Shell không còn trong menu dòng Node, nút Shell ở Node detail biến mất. Bật lại flag thì cả hai hiện lại | |
| G8 | Rancher 2.13/2.14 (không có hai flag trên) | Shell hoạt động như G1 | |

## H. Regression: Deployment hiện pod lạ

| ID | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| H1 | User `<project-role>`: F5 thẳng trên URL Deployment `<namespace>/<deployment>` (`<cluster>`), chờ > 6 phút | Tab Pods luôn = số replica; Services / Ingresses đúng | |
| H2 | Như H1 với admin | Như trên | |
| H3 | Deployment → Nodes → quay lại Deployment đó | Số pod đúng | |
| H4 | Deployment → Node detail (xem tab Pods) → quay lại Deployment đó, **trên cụm không bật vai** | Số pod đúng | |
| H5 | Mở 3 tab trình duyệt để yên 15 phút, rồi xem access log của Kong gateway | Không có `/v1/pods?pagesize=100000…` định kỳ (6.2.1 cứ 5 phút mỗi tab gọi 1 lần) | |

## I. Hiệu năng và lượng request

| ID | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| I1 | `ls -l dist-pkg/rancher-node-filter-7.0.1/*.umd.min.js` | Entry ≤ 60 KB (hiện ~7 KB). Tổng chunk trang Nodes khoảng 540 KB | |
| I2 | F5 trên trang Deployment. DevTools: thời gian từ `/v1/uiplugins` tới request `management.cattle.io.settings` tiếp theo | Nhỏ hơn rõ so với 6.2.1 (trước là 2–39s) | |
| I3 | Tab chứa trang Pods chuyển sang ẩn 2 phút (chuyển tab khác) | Không có request `metrics.k8s.io` trong lúc ẩn; quay lại thì refresh ngay | |
| I4 | Trang Pods với panel Top pods đang thu gọn | Request metrics chỉ theo namespace của các dòng đang hiển thị khi ≤5 namespace, hoặc đúng 1 request toàn cụm khi >5 namespace. Mỗi chu kỳ 30s không có request trùng | |
| I2b | F5 trên trang Nodes, DevTools → Network lọc `uiplugins` | Tổng dung lượng file plugin khoảng 540 KB (không cache), hoặc 304 / 0 byte nếu đã áp dụng cấu hình cache ở Kong (FEATURES.md, mục F5 và cache) | |
| I5 | Access log Kong gateway 1 giờ, đếm theo referer (lệnh bên dưới) | Không có `query=up`. Metrics pod theo namespace. Không có `pagesize=100000` từ `explorer/pod` | |

```bash
# Đếm request Rancher theo trang gọi (referer), dùng cho I5 / H5
for p in $(kubectl --context=<ctx> -n <kong-namespace> get pod -o name | grep <kong-gateway-deployment>); do
  kubectl --context=<ctx> -n <kong-namespace> logs $p --since=1h
done | grep -E '^[0-9.]+ - - ' | awk -F'"' '{split($2,r," "); p=r[2]; sub(/\?.*/,"",p); ref=$4; sub(/https:\/\/[^/]+/,"",ref); print ref" <- "p}' \
  | sort | uniq -c | sort -rn | head -40
```

## J. Tương thích

| ID | Bước | Mong đợi | Kết quả |
|---|---|---|---|
| J1 | Chạy toàn bộ A–I trên Rancher 2.13.1 | Pass | |
| J2 | Chạy toàn bộ A–I trên Rancher 2.14.3 | Pass | |
| J2b | Chạy toàn bộ A–I trên Rancher 2.15.2 | Pass | |
| J3 | Trước khi nâng Rancher: diff `shell/list/node.vue` và `shell/detail/node.vue` của phiên bản mới với bản copy trong plugin | Không có thay đổi gốc nào bị mất | |
