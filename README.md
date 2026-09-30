# Command Code Extension — OpenCode V2 TUI

Plugin độc lập: kết nối Command Code, tải catalog model, hiển thị usage **5h / 1w / 1M**, reset countdown và credit. Không sửa/xóa provider hay credential hiện tại của bạn.

## Cài từ project này

Trong thư mục `opencode-commandcode-usage`, chạy:

```sh
npm ci --ignore-scripts
```

Thêm **một entry** vào mảng `plugins` trong `~/.config/opencode/opencode.jsonc` để dùng mọi project, hoặc trong cấu hình project để chỉ dùng tại đó. Giữ nguyên các setting/plugin khác:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "/Users/levandong/Desktop/src/finance/opencode-commandcode-usage"
  ]
}
```

Nếu chuyển thư mục, đổi đường dẫn tương ứng. Không chỉ thêm vào `cli.json`: plugin cần **server + TUI**. OpenCode tải `./tui` từ package tự động.

Khởi động lại OpenCode sau khi thêm plugin. Nếu server chưa nhận cấu hình:

```sh
opencode service restart
```

Restart service có thể ngắt các session đang chạy; thực hiện khi phù hợp.

## Kết nối và chọn model

1. Chạy `/connect`, chọn **Command Code Extension**, nhập API key từ Command Code Studio vào giao diện kết nối của OpenCode — không gửi key trong chat.
2. Chạy `/commandcode-models-refresh`.
3. Chạy `/models`, chọn model dưới provider **Command Code Extension** (`commandcode-extension`).
4. Sidebar hiển thị quota; `/commandcode-usage` mở panel chi tiết. Ở màn hình Home, lệnh mở dialog.

Credential được lưu bởi cơ chế integration của OpenCode. Plugin không đọc file auth cũ, không lưu key trong plugin storage hoặc RPC và không ghi response body/exception có thể chứa key vào log. TUI không nhận key. Integration ID mới không trùng setup cũ.

## Các lệnh

| Lệnh | Tác dụng |
| --- | --- |
| `/commandcode-usage` | Mở bảng chi tiết usage/reset |
| `/commandcode-refresh` | Làm mới usage ngay |
| `/commandcode-models-refresh` | Tải lại catalog, đồng bộ danh sách model |

Quota tự refresh 60 giây; catalog mỗi 15 phút. Countdown cập nhật mỗi giây mà không gọi API. TUI đọc trạng thái server mỗi 5 giây. Request đồng thời được gộp; unload hủy request/timer.

## Đơn vị và độ chính xác

- **5h / tuần:** lấy `used`, `cap`, `resetAt` trực tiếp từ `windowLimits`; đơn vị **credit**, không giả định là USD.
- **1M:** chu kỳ billing, không phải 30 ngày cố định hay ngày đầu tháng. Lấy reset từ `currentPeriodEnd`.
- **Spent USD:** chi phí thực tế từ `/alpha/usage/summary`; lọc từ `currentPeriodStart` nếu có. Không có kỳ billing thì ghi rõ `all-time`.
- **Balance:** credit tháng, mua thêm, miễn phí được tách riêng. Tổng còn lại chỉ được cộng khi đủ cả ba nguồn.
- Credit tháng còn lại **không phải** credit tổng của gói. Một số API chỉ trả balance, không trả allocation. Khi đó tổng/đã dùng/% tháng là `?`; plugin không lấy USD đã tiêu + balance để tạo tổng sai.
- Nếu biết chính xác allocation tháng trong **credit**, bạn có thể khai báo override thủ công dưới đây. Nó không tự cập nhật khi nâng/hạ gói; cần sửa hoặc bỏ override khi đổi gói. `credits.monthlyAllocation`, nếu API cung cấp, được ưu tiên; field này là tương thích bổ sung, chưa được xác minh trên tài khoản thật.
- Credit mua thêm có thể bypass cap 5h/tuần. Không có cap trong phản hồi có thể là tài khoản uncapped hoặc API thiếu dữ liệu; plugin ghi `not reported`, không tự kết luận hết limit.
- API lỗi toàn bộ: giữ snapshot cũ và gắn `STALE`. Đổi connection: xóa snapshot/cached model cũ trước khi tải lại. 401/403: xóa quota và model, đề nghị kết nối lại.

Ví dụ cấu hình tùy chọn:

```jsonc
{
  "plugins": [
    {
      "package": "/Users/levandong/Desktop/src/finance/opencode-commandcode-usage",
      "options": {
        "refreshIntervalMs": 60000,
        "monthlyCreditLimit": 80
      }
    }
  ]
}
```

`80` chỉ minh họa, **không phải** giá trị mặc định. Không đổi credit sang `$` nếu gói/model có hệ số quy đổi khác.

## Model và giới hạn hiện tại

- Catalog live: `https://api.commandcode.ai/provider/v1/models`. Chọn Anthropic-compatible cho `/messages`, OpenAI-compatible cho `/chat/completions`, giữ nguyên model ID có dấu `/`.
- Catalog hiện là danh sách **chung**, không đảm bảo mọi model đều được gói của bạn cấp quyền. Plugin đưa mọi model chat hợp lệ vào `/models`; Command Code kiểm tra quyền ở request. Không gọi từng model để probe vì sẽ tốn tiền.
- Metadata giá token/vision/reasoning không đầy đủ trong catalog. Không suy đoán giá; `cost: []` nghĩa là **chưa biết**, không có nghĩa model miễn phí. Dùng USD usage của tài khoản để xem chi phí thật.
- Model mặc định text-only khi API không báo image input; output mặc định 32K nếu không báo max output. Chưa tự tạo reasoning variants hoặc hỗ trợ transport `/alpha/generate` cho gói không có Provider API access.
- API usage `/alpha/whoami`, `/alpha/billing/credits`, `/alpha/billing/subscriptions`, `/alpha/usage/summary` là **alpha**, có thể đổi schema. Field thiếu hiển thị unknown; không có dữ liệu hợp lệ thì báo lỗi.
- Chưa kiểm thử đăng nhập và usage với tài khoản thật; không dùng key/setup hiện tại của bạn. Chỉ bỏ setup cũ sau khi thử provider mới thành công.

## Kiểm thử

```sh
npm run check
```

SDK smoke test cần **Node >=26.4** (SDK dùng explicit resource management), chạy cô lập database/config, mock Command Code và không phát sinh chi phí:

```sh
npm exec --yes --package=node@26 -- npm run validate
```

Smoke kiểm tra integration riêng, kết nối key, model discovery, quota RPC, native Chat/Anthropic streaming và Authorization header. Node 22 chạy unit test/typecheck được nhưng không chạy SDK smoke được.

Native TUI render smoke dùng Bun và renderer OpenTUI thật với dữ liệu mock:

```sh
npm exec --yes --package=bun -- bun --preload @opentui/solid/preload tests/tui-smoke.tsx
```

Kiểm tra sidebar phản ứng với dữ liệu, thanh quota, đăng ký slash command và resize terminal hẹp.

Source TypeScript/TSX là entrypoint native theo plugin API V2; không cần bước compile ra `dist`. Package nhắm OpenCode **2.0.19**. UI đã qua native render smoke; vẫn cần kiểm tra trực quan trong phiên OpenCode của bạn sau khi cài.

Tài liệu: [V2 plugins](https://opencode.ai/v2/docs/build/plugins/), [TUI plugins](https://opencode.ai/v2/docs/build/plugins/cli/), [Command Code usage](https://commandcode.ai/docs/resources/usage-limits).
