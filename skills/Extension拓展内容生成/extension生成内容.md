# Extension（博见）板块 · 技能文档

> 本文件是 Extension 板块的**技能化总结**（供新会话快速上手开发/排障）。
> 配套项目纪要：同文件夹 `项目纪要.md`（板块功能与现状）。
> 代码位置：`C:\Users\Delphi\Desktop\测试版\Extension板块测试版\bojian.js`（v3.2）

## 技能名：extension生成内容

## 何时使用
- 需要修改/扩展/排障 **博见（Extension）板块** 时
- 需要**仿照本板块模式新建 AFR 第七/第八板块**时（本板块的架构即模板）
- 用户提到：博见、Extension、展廊、展品、外框、影院框、黑胶框、语料撷英、微思考、课堂彩蛋

## 架构模式（零侵入，AFR新板块的标准范式）

```
AFR完整系统（index.html + script.js + libs）不改动主逻辑
新板块 = 独立 IIFE 文件（如 bojian.js） + 3行接线：
  1. index.html 顶部Tab区加按钮：<button class="view-tab" data-view="xxx" onclick="Xxx.show()">名称</button>
  2. main区加容器：<div class="knowledge-view hidden" id="xxxView"></div>
  3. 底部加脚本：<script src="xxx.js?v=版本号"></script>（每次修改必须bump版本号，防缓存）
```

### 必须处理的四件事
1. **视图互斥双兜底**：MutationObserver（观察AFR五视图+essayView+bojianView的class）+ document click捕获（点其他tab藏自己）；且 show() 时藏所有互斥视图
2. **AFR主头部遮挡**：主头部 relative+z-index:1000——新视图 absolute inset:0 会被盖住；必须 fitTop()：视图 top = 主头部 offsetHeight，window.resize 跟随
3. **AFR异步启动竞态**：createBlankHomework/启动尾部的 switchView 会把刚点开的视图藏掉——show() 时设 guardUntil = Date.now()+5000，守卫窗内 MutationObserver 不隐藏，另加 120ms 轮询兜底夺回
4. **版本号bump**：改 JS 后不改 index.html 的 ?v= 参数，浏览器缓存会吃掉修改（症状：改了没反应/旧功能复活）

### 主题适配
- 走廊区（顶栏/弹层/按钮/chips）：全部用 AFR CSS变量（--color-primary/--bg-panel/--border-color-light 等）→ 13套主题自动适配
- 展框区（影院/黑胶/书报/画布）：硬编码画廊美学（金色系）不随主题——"走进展馆换频道"

## 四款装裱外框实现要点

| 外框 | 关键CSS/JS |
|---|---|
| 📺影院 | 黑底#14161c+ON AIR呼吸灯+aspect-ratio:16/9；播放=注入iframe（bilibili player.html?bvid=XX&autoplay=1&mute=1）；**控制条**：🔇静音切换（mute参数重注入，不跳B站页）+⛶全屏（对screen容器requestFullscreen）；videoEmbed(url, mute) 解析BV号/YouTube |
| 🎵黑胶 | repeating-radial-gradient唱片纹+conic高光+spinning动画；网易云 outchain player iframe（id提取）或mp3直链audio |
| 📖书报 | 书：米色纸纹+Georgia/宋体+首字下沉(lead::first-letter)；报：报头+日期+column-count:2分栏 |
| 🖼画布 | 金色渐变雕花边+帆布底纹+展签铭牌；img onerror → 检索词占位卡 |

## 数据模型

```js
// localStorage 'AFR-bojian-v3'（v1→v3有迁移逻辑）
{
  papers: [{id, name, date}],   // 试卷存档
  cur: 'p-xxx',                  // 当前试卷
  data: { 'p-xxx': { sections: { reading/five7/cloze/gapfill/writing/cont: {
      topic, trace,              // 语篇溯源
      browse: [{id,type:'video|audio|text|image',tpl,title,en,url,body,kw,source,diff,ai,reviewed,egg,sec}],
      corpus: [{id,term,meaning}],  // 语料撷英
      think: {q, replies:[{id,name,text,time,reply}]}  // 微思考+留言
  }}}},
  notebook: [{term,meaning}]     // 跨试卷语料本
}
```

## 排障清单（本板块实战踩过的坑）

| 症状 | 根因 | 解法 |
|---|---|---|
| 板块视图整个不出现/被藏 | AFR异步启动竞态或主头部遮挡 | fitTop让位 + guardUntil守卫窗 + 轮询兜底 |
| 改了JS没反应 | index.html的?v=没bump | 必须同步改版本参数 |
| git操作报dubious ownership | E盘/桌面无所有权信息 | `git -c safe.directory="路径"` |
| 输入框打字被清空 | oninput整表renderContent重绘 | 改外科手术式更新（只更新可视化节点） |
| IndexedDB读数随机为空 | getAll/get双请求在onsuccess里互读，未等事务complete | 改在 tx.oncomplete 里统一读result |
| 函数报not defined | IIFE闭包内函数，页面evaluate不可见；或补丁叠加漏定义 | node --check + 全文grep调用点逐一核对 |

## 测试范式

- Python Playwright（channel="msedge", headless=True）+ `python -m http.server 8793`
- 测试脚本：`E:\AIkoko\Zcode for this item\shots\test_bojian_v31.py`
- 经验：JS evaluate点击（绕actionability玄学）；关键断言前加wait_for_timeout；pageerror立即落盘日志；404噪音过滤
