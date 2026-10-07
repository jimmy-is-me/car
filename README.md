# 汽車管理

免費、無廣告、繁體中文的個人汽車管理網站。純靜態 HTML / CSS / JavaScript，無需自建付費後端。提供圖標來自使用者的 WU-FAV.zip。

## 功能

- 手機、平板、桌面響應式版面；可縮放；鍵盤操作、焦點提示與原生可存取對話框。
- 多車管理：車名、車牌、品牌、車型、年份、動力、VIN、起始里程、油箱容量與購車日期。
- 加油：油種、公升、單價、實付金額、加滿、未加滿及漏記；滿箱法 km/L、L/100km。
- 充電：方式、kWh、起訖電量、電站、費用。充入電量不等同實際行駛電耗。
- 保養維修：多選項目、店家、零件費、工資、料號、收據及備註。
- 停車、ETC、保險、牌照稅、燃料費、驗車、洗車等分類支出。
- 行程：距離、起訖地點、用途及直接支出（避免重複計入加油支出）。
- 日期／里程提醒、完成狀態；開站提醒，無背景推播。
- 每月支出趨勢、分類成本、有效滿箱區間、期間每公里成本、列印。
- 編輯、刪除確認、搜尋與日期篩選、JSON 備份合併、CSV 匯出。
- Google Drive 私有應用資料同步、帳號隔離、離線暫存、自動重試及錯誤提示。
- PWA 安裝與已載入頁面的離線使用。

## GitHub Pages 部署

已包含 `.github/workflows/pages.yml`，推送 `main` 會先執行測試，再部署靜態檔案。

1. 儲存庫 **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。首次部署若自動啟用失敗，手動設定後於 Actions 重新執行工作流程。
2. 預期網址：`https://jimmy-is-me.github.io/car/`。實際部署狀態以 GitHub Actions 結果為準。
3. 網頁使用相對路徑，可改放其他 HTTPS 靜態主機。

## Google 同步必須完成的專案設定

用戶端 ID 已設於 `sync.js`：

`174739541877-kjranr4hd63oomtk4117hbgfvouutsef.apps.googleusercontent.com`

**只有 Client ID 無法啟用雲端 API 或代替使用者授權。** 請使用此 ID 所屬的 Google Cloud 專案：

1. **APIs & Services → Library** 啟用 **Google Drive API**。
2. **Google Auth Platform → Clients** 找到此 **Web application** 用戶端。在 **Authorized JavaScript origins** 加入 `https://jimmy-is-me.github.io`（只有來源，不含 `/car/`），開發時可加入 `http://localhost:4173` 與 `http://127.0.0.1:4173`。
3. 在 **Branding / Audience / Data Access** 設定應用名稱「汽車管理」、支援聯絡資料、公開首頁及隱私權網址；公開網址部署完成後可填 `https://jimmy-is-me.github.io/car/` 和 `https://jimmy-is-me.github.io/car/privacy.html`。
4. 授權範圍使用 `openid`、`email`、`profile`、`https://www.googleapis.com/auth/drive.appdata`。私人測試時將自己的 Google 帳號加入測試使用者；供所有人使用時切換正式發布並完成 Google 要求的任何審查。是否需驗證及授權網域取決於專案設定，請依控制台提示處理。
5. 分別在電腦與手機開啟網站，按 **登入 Google**，選同一帳號並允許存取。首次登入看到獨立的帳號資料；若之前有本機紀錄，到 **設定 → 將此瀏覽器的本機資料加入帳號**。
6. 兩邊新增或編輯紀錄，等待約 30 秒或按立即同步驗證。OAuth token 僅在記憶體，重開網站或授權過期需再次按登入；不會暗中保存長效 token。

常見錯誤：`origin_mismatch` 表示網站來源未列入；403 可能是 Drive API 尚未啟用、權限拒絕或測試使用者設定。UI 不會把同步失敗當成成功；待上傳資料會留在該帳號的本機儲存區。

## 同步資料模型與限制

每批修改建立不可變的 Drive `appDataFolder` JSON 檔，標記 `appProperties.app=car-manager-v1`。登入及每 30 秒拉取所有修改，依實體 ID、時間戳與 revision 合併；各裝置新增的不同紀錄不會因快照覆寫而消失。相同紀錄同時編輯採最新修改，時間相同時以 revision 決定；無手動版本衝突介面。刪除採 tombstone，防止離線裝置復活資料。伺服器建立檔案回應遺失時可能留重複操作檔，但合併具冪等性。

以本機時間及已讀取的最大版本作為排序時鐘；裝置時鐘差異可能影響相同實體衝突的勝出版本。歷史檔會累積，未實作自動壓縮；適合個人使用，大量歷史時首次同步較慢。不是即時共編服務。同一瀏覽器多分頁透過 storage 事件更新，但請避免多分頁同時編輯同一筆資料。

本機資料使用 localStorage，每個 Google `sub` 獨立儲存；登入不會自動將訪客資料混入帳號。Google 權杖不寫入磁碟。登出保留該帳號離線快取，共用電腦請清除此網站儲存。備份為 JSON，不加密；請自行妥善保存。

完整清除雲端資料：停止所有裝置同步，Google Drive **設定 → 管理應用程式** 刪除隱藏資料，並清除各裝置網站儲存。單筆刪除只移除活躍檢視，歷史與 tombstone 仍保留。

## 本機開發與驗證

Node.js 22+，不需安裝依賴：

```sh
npm test
npm start
```

開啟 `http://127.0.0.1:4173`。Google 登入需在 Cloud 加入對應來源。核心測試涵蓋部分補油、漏記、加權油耗、刪除合併、排序衝突、提醒及備份驗證；同步測試以模擬 Drive 確認併發修改、重試、帳號隔離。真正 Google 登入與跨裝置測試需要完成專案設定並由使用者授權。

所有金額固定 TWD，距離 km，油量 L。成本是已登錄支出估計值，不含未登錄費用或資產折舊。保養間隔應由車主依原廠手冊設定，不套用通用安全建議。

## 功能研究參考

- [Drivvo 官方功能](https://www.drivvo.com/en-US/)：燃料、費用、保養、提醒與報表。
- [Fuelio 官方功能](https://www.fuel.io/) 與 [滿箱油耗 FAQ](https://fuel.io/faq_fuel_consumption.html)：公升、里程、成本與滿箱演算法。
- [Google Identity token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)：使用者觸發 OAuth 及權杖到期再授權。
- [Google Drive appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata)：僅存取本應用的私有資料。
