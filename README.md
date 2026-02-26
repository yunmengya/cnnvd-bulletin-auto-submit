# CNNVD 自动填报助手（Chrome MV3）

## 已实现能力
- 页面右侧悬浮窗（无弹窗）
- 多文件导入 + 目录导入（仅 `.docx`）
- 文件名关键词过滤（命中即不导入）
- 自动提取文件名首个 `CVE-YYYY-NNNN...`
- 自动生成 `关于XX的通报`
- 从 docx 文本中提取“产品描述”开始的正文
- 单文件 docx 打包 zip 并用于第一页上传
- 第一页自动填写与下拉匹配（匹配不到选“暂无”）
- 第二页自动填写（标题 + 正文）并支持自动提交/手动提交
- 第三页识别“提交成功”并点击“提交成功”按钮返回第一页
- 失败重试（最多2次）、日志记录、CSV 导出
- 字段重标定（点击页面元素重新定位字段）

## 目录
- `manifest.json`
- `src/background/service-worker.js`
- `src/content/automation.js`
- `src/content/panel.js`
- `src/shared/types.js`
- `src/shared/messages.js`
- `src/lib/docx.js`
- `src/lib/zip.js`
- `src/lib/queue.js`
- `src/lib/selectors.js`
- `src/lib/logger.js`
- `src/styles/panel.css`
- `vendor/jszip.min.js`

## 安装
1. 打开 Chrome: `chrome://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择目录：`/Users/dream/vscode_code/cnnvd_upload`

## 使用
1. 打开 CNNVD 业务页面（已登录）
2. 右侧打开 `CNNVD助手`
3. 在“基础配置”填写技术支持信息并保存
4. 在“导入过滤”设置关键词，导入文件或目录
5. 点击“开始”执行队列

## 字段重标定
1. 进入“字段配置”Tab
2. 点击“进入标定模式”
3. 在某个字段行点击“重标定”
4. 在页面中点击目标元素完成绑定
5. 点击“测试”验证命中

## 注意
- 只支持 `.docx` 正文解析。
- 浏览器重启后不会自动继续运行，需要手动点击“继续”。
- 运行中如果检测到人工点击/输入，会自动暂停。
