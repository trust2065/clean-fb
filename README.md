# Clean FB

讓 Facebook 只剩下「內容」的 Chrome 擴充功能。

隱藏左右兩側欄、廣告、Reels、「你可能認識的朋友」與社團建議，並把中間的動態消息拉寬到整個畫面。往下捲動時陸續載入的貼文也會即時處理。

## 功能

| 功能 | 預設 | 說明 |
| --- | --- | --- |
| 隱藏左右側欄 | 開 | 移除左側捷徑選單，以及右側的聯絡人、贊助、生日等區塊 |
| 內容寬度 | 全寬 | 把中間內容拉寬到側欄原本的位置；可選 全寬 / 1400px / 1100px / 900px |
| 隱藏廣告 | 開 | 隱藏標示「贊助」/ Sponsored 的貼文 |
| 隱藏 Reels | 開 | 隱藏 Reels 貼文與「連續短片」輪播區塊 |
| 隱藏朋友建議 | 開 | 隱藏「你可能認識的朋友」/ People you may know |
| 隱藏社團建議 | 開 | 隱藏「你的社團建議」/ Suggested groups |
| 隱藏「為你推薦」貼文 | 關 | 隱藏你沒有追蹤的粉專推薦貼文 |

所有設定都在擴充功能的彈出視窗中切換，所有已開啟的 Facebook 分頁會立即套用，不需重新整理。
修改程式碼後，在 `chrome://extensions` 按擴充功能上的重新載入 (↻)，再重新整理 Facebook。

## 檔案結構

```
manifest.json   擴充功能設定（Manifest V3，content script 於 document_start 注入）
content.js      主要邏輯：偵測貼文類型、找出側欄、拉寬內容、監聽捲動載入
content.css     真正負責隱藏與拉寬的 CSS 規則
popup.html/js   設定視窗
popup.css       設定視窗樣式
```

---

## 運作原理

### 整體設計：「JS 負責標記，CSS 負責隱藏」

`content.js` 不會直接刪除或修改 Facebook 的元素，只會在元素上加標記屬性：

- `data-cleanfb-hide="ads|reels|friends|groups|suggested"`：要隱藏的貼文
- `data-cleanfb-rail="left|right"`：左右側欄
- `data-cleanfb-wide="box|max"`：需要拉寬的容器

真正的隱藏由 `content.css` 完成，而且每條規則都要求 `<html>` 上有對應的 class（例如 `cleanfb-ads`）：

```css
html.cleanfb-ads [data-cleanfb-hide="ads"] { display: none !important; }
```

好處：

- **切換即時且可還原**：關掉某個過濾器只是拿掉 `<html>` 上的 class，被標記的元素馬上重新出現。
- **不和 Facebook 的 React 打架**：刪除節點可能讓 Facebook 重新渲染或出錯，只加屬性和 CSS 則安全得多。
- **一律標記**：即使某個過濾器是關閉的，貼文仍會被分類標記，之後打開時不用重新掃描。

### 不會閃一下：在頁面開始載入時就注入

`manifest.json` 設定 `"run_at": "document_start"`。腳本一啟動就先依預設值把 class 加到 `<html>` 上，等 `chrome.storage` 讀到使用者設定後再修正。所以在設定讀出來之前，廣告或側欄也不會先出現。

### 什麼是「一則貼文」

Facebook 的 class 名稱是混淆過、而且經常變動的，所以只用比較穩定的語意屬性來找貼文：

```js
'[role="feed"] > *'                    // 動態消息的每個子項目
'[data-pagelet^="FeedUnit"]'           // 舊版的貼文容器
'[aria-posinset]'                      // 無障礙用的「第 N 則」屬性
'[role="article"]:not([role="article"] [role="article"])'  // 最外層 article（排除留言）
```

找到符合的元素後會一路往上，取**最外層**的那一個，確保隱藏的是整則貼文，不會只藏掉一半而留下空白外框。

---

### 隱藏廣告（重點說明）

Facebook 刻意讓廣告難以被偵測，主要手法有：

1. 「贊助」/ Sponsored 標籤不是純文字，而是**拆成很多個 `<span>`，中間混入看不見的假字母**（例如原始文字是 `Spxonsoqred`，但畫面上只看到 `Sponsored`）。
2. 用 CSS `order`、絕對定位等方式**打亂字母順序**，或把假字母移到框外。
3. 有時標籤藏在 `aria-labelledby` 指向的隱藏元素，或 SVG `<use>` 引用的 `<text>` 裡。

所以如果只檢查「貼文文字裡有沒有 Sponsored」，不是抓不到廣告，就是會誤殺一般貼文（例如有人在貼文裡寫「感謝贊助」）。`isAd()` 依序做四層檢查，任一層成立就判定為廣告：

**第 1 層：直接訊號**

貼文內有「為什麼我會看到這則廣告」連結（`a[href*="/ads/about"]`），或 `aria-label` 剛好是 `Sponsored` / `贊助` / `赞助` 的連結。

**第 2 層：`aria-labelledby`**

檢查所有帶 `aria-labelledby` 的元素，把它指向的元素文字取出比對。

**第 3 層：SVG `<use>`**

檢查 `<svg><use href="#id">` 引用的元素，看文字是不是廣告標籤。

**第 4 層：還原被打亂的標籤（核心）**

1. **便宜的預先篩選**：對貼文裡每個文字很短（≤ 60 字）的 `<a>` / `<span>`，檢查「贊助」等標籤是不是它原始文字的**子序列**（subsequence）。例如 `sponsored` 是 `spxonsoqred` 的子序列。不是子序列就直接跳過，所以大部分元素幾乎不花成本。
2. **只看貼文開頭**：如果元素出現在貼文內文（`[data-ad-preview="message"]`）**之後**就不算。所以留言或內文裡出現「贊助」兩個字不會誤判。
3. **計算「使用者實際看到的文字」**：`visibleText()` 會逐一檢查每個文字節點，排除：
   - 沒有實際尺寸（沒被渲染）的
   - `visibility: hidden`、`opacity: 0`、`font-size: 0` 的
   - 位置在元素外框之外（被定位移走的假字母）的

   然後**依畫面上的 x 座標重新排序**，還原被 `order` 打亂的順序。
4. 正規化（轉小寫、去掉空白與零寬字元）後，必須**完全等於**某個廣告標籤才成立。

支援的標籤語言包括：繁中「贊助」、簡中「赞助」、「廣告」、英文 Sponsored、越南文、法文、德文、西班牙文、日文、韓文等（見 `AD_LABELS`）。

此外，`content.css` 也用 `:has()` 對最明顯的訊號做「純 CSS 即時隱藏」，讓貼文在 JS 執行前就看不到：

```css
html.cleanfb-ads [role="feed"] > :has(a[href*="/ads/about"]) { display: none !important; }
```

---

### 隱藏 Reels、朋友建議、社團建議、為你推薦

這幾種都是 Facebook 插在動態消息中的「模組」，判斷方式相同，分兩種訊號：

**1. 連結訊號（最可靠，也有純 CSS 版本）**

| 類型 | 判斷依據 |
| --- | --- |
| Reels | 貼文內有 `a[href*="/reel"]`（涵蓋 `/reel/` 與 `/reels/`） |
| 朋友建議 | 有「查看全部」連結 `a[href*="/friends/suggestions"]` |
| 社團建議 | 有 `a[href*="/groups/discover"]` |

**2. 標題訊號**

檢查模組內短文字（≤ 40 字）的標題元素，正規化後用正規表達式**完整比對**（見 `HEADINGS`），例如：

- Reels：`Reels`、`Reels 和短片`、`連續短片`、`短影音`
- 朋友建議：`你可能認識的朋友`、`你可能認識的人`、`People you may know`
- 社團建議：`你的社團建議`、`社團建議`、`推薦社團`、`Suggested groups`
- 為你推薦：`為你推薦`、`建議貼文`、`Suggested for you`

用「完整比對」而不是「包含」，所以一般貼文內文提到「reels」不會被誤藏。

**備援：不像貼文的模組**

有些模組（例如社團建議輪播）沒有被包在一般貼文結構裡，上面的「貼文」選擇器抓不到。`scanHeadings()` 會在主內容區直接搜尋上述標題，再用 `cardFromHeading()` 從標題往上找「列表中的一個項目」：父層至少有 3 個子元素、自己寬 ≥ 300px、高 ≥ 150px 的那一層。安全限制：

- 高度超過 1400px 就放棄（不可能是單一模組，避免藏掉整個欄位）
- 永遠不會隱藏包含整個動態消息（`[role="feed"]`）的元素

---

### 隱藏左右側欄

**CSS 部分**：直接隱藏已知的側欄元素：`[role="complementary"]`（右側欄）、`aria-label` 為「捷徑」/ Shortcuts 的導覽列（左側欄）、`data-pagelet="LeftRail"/"RightRail"`。

**JS 部分（`markRails()`）**：因為 Facebook 的版面會變，另外用**幾何位置**判斷：

1. 從主內容 `[role="main"]` 開始往上走每一層祖先。
2. 檢查每一層的兄弟元素：如果它**完全在主內容的左邊或右邊**、寬 ≥ 100px、高度超過半個視窗、從畫面頂端附近開始，就是側欄。
3. 高度幾乎為 0、但仍佔著寬度的**空殼容器**（內容已被 CSS 藏掉）也一併移除，避免留下空白。
4. 一律跳過頂部導覽列（`role="banner"`）和對話框（`role="dialog"`），聊天視窗不會被誤藏。

因為只檢查 `[role="main"]` 的祖先與它們的兄弟，成本很低。`/messages`（Messenger）和 `/settings` 不處理，因為那些頁面的側欄本身就是內容。

### 拉寬內容區

Facebook 的動態消息被限制在約 680px 寬，而且限制寫在混淆過的 class 裡。所以這裡不靠 class 名稱，而是**用量測到的版面**找出「被限制住的容器」：

1. **祖先路徑**：從 `<body>` 到 `[role="main"]` 這一路的每一層，如果寬度明顯小於父層（< 90%），就標記 `data-cleanfb-wide="box"`，讓它 `width: 100%` 並填滿空間。
2. **主內容內部**：用廣度優先（BFS）往下走到貼文為止（包含限時動態、發文框）：
   - 寬度 ≥ 500px 但比父層窄 → `box`（拉寬）
   - 有 px 單位的 `max-width` → `max`（解除上限）
   - 小於 500px 的元素（頭像、按鈕）不處理；圖片、影片、SVG 也不處理
3. **每則貼文**：在處理貼文時對前幾層容器做一樣的事，但較深層的圖片容器不動，避免變形。
4. **保護多欄版面**：如果某元素旁邊同一列還有另一個欄位（例如社團頁面的「關於」框），就不拉寬，避免擠壞版面。
5. **重新排版媒體**：拉寬後送出一次 `resize` 事件，讓 Facebook 依新寬度重新計算圖片與影片大小。

最大寬度由 CSS 變數 `--cleanfb-width` 控制，也就是彈出視窗中的「內容寬度」設定。只有在原本有側欄的頁面（首頁、社團等）才會拉寬，個人檔案這類有自己版面的頁面不受影響。

---

### 處理往下捲動才載入的內容

Facebook 是無限捲動加上單頁應用（SPA），內容會持續被插入，而且常常是**先插入空的貼文框，文字稍後才填進去**。處理方式：

1. **`MutationObserver`** 監聽整份文件的 `childList`（新增節點）與 `characterData`（文字變動），所以「之後才填入的『贊助』標籤」也會觸發重新檢查。
2. **只處理有變動的部分**：每個變動節點會被對應到它所屬的貼文，放進待處理集合（`pendingUnits`）。如果變動不在任何貼文內（例如插入一整塊內容），就掃描其中的貼文與模組標題（`pendingScopes`）。
3. **批次處理**：同一個畫面週期內的所有變動，在 `requestAnimationFrame` 中一次處理。這發生在瀏覽器下一次繪製之前，所以新貼文通常在被看到前就已隱藏。
4. **已隱藏的貼文不再檢查**，減少重複工作。
5. **側欄與拉寬**的檢查會用到版面量測，成本較高，所以最多每 500ms 做一次。
6. **換頁偵測**：每次處理時比對 `location.pathname`。網址變了（例如從首頁點進社團），就清除舊的側欄 / 拉寬標記並重新掃描。
7. **純 CSS 先擋**：Reels、朋友建議、社團建議、廣告最明顯的連結訊號另外寫成 `:has()` CSS 規則，連 JS 都不用等。

### 設定同步

設定存在 `chrome.storage.sync`（會跟著 Chrome 帳號同步）。彈出視窗只負責寫入設定，每個 Facebook 分頁的 content script 會監聽 `chrome.storage.onChanged`，自行更新 `<html>` 上的 class，所以所有分頁都會同時套用。

---

## 除錯

- 被隱藏的元素會帶有 `data-cleanfb-hide`、`data-cleanfb-rail` 或 `data-cleanfb-wide` 屬性。可以在 DevTools 的 Elements 面板搜尋這些屬性，或在彈出視窗關掉對應的過濾器，看看被藏了什麼。
- 如果有漏網之魚（例如新的模組標題），把標題文字加到 `content.js` 的 `HEADINGS`；廣告標籤的新語言加到 `AD_LABELS`。
- 修改後記得在 `chrome://extensions` 重新載入擴充功能，**並且**重新整理 Facebook 分頁（舊分頁仍在執行舊版腳本）。

## 已知限制

- Facebook 經常改版，任何選擇器或標題文字都可能失效，需要隨時更新。
- 只針對桌面版 `www.facebook.com` 設計並測試。
- 分享 Reels 連結的一般貼文也會被當成 Reels 隱藏。

## 未來規劃

- 過濾 AI 生成內容
