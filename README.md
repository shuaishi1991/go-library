# 围棋书房

以书籍形式组织的交互式围棋知识库。纯静态站点（无构建、无依赖），可直接部署到 GitHub Pages。

## 本地预览

浏览器安全限制不允许 `file://` 方式读取数据文件，本地预览需启动任意静态服务器：

```bash
python3 -m http.server 8000
# 打开 http://127.0.0.1:8000
```

## 部署到 GitHub Pages

1. 将本目录推送到 GitHub 仓库；
2. 仓库 Settings → Pages → Source 选择分支根目录（`/`）；
3. 访问 `https://<用户名>.github.io/<仓库名>/`。

## 目录结构

```
index.html            首页（书架）
reader.html           阅读页（棋盘 + 目录 + 文字说明）
assets/               样式与脚本
books/
  index.json          书籍注册表（自动生成）
  <书id>/
    book.json         书籍元数据与章节清单（自动生成）
    data/<章id>.json  每章的型/图数据（自动生成）
tools/
  build_book.py       从 SGF 目录生成书籍数据
```

## 添加 / 更新一本书

```bash
python3 tools/build_book.py <sgf根目录> <书id> <书名>
# 例：python3 tools/build_book.py ../常型解析/sgf changxing 新编围棋常型技巧大全
```

SGF 目录约定：`NN-上册|下册-章名/第NNN型/*.sgf`。脚本会解析每图的初始布局（AB/AW）、
行棋序列、字母标记（LB）、三角标记（TR）与注释（C），并更新 `books/index.json`。
删除书籍只需删除 `books/<书id>/` 并从 `books/index.json` 移除对应条目。

## 阅读页功能

- 看谱：首手/上一手/下一手/末手、自动播放（约 1 秒/手），← → 方向键步进，↑ ↓ 切换图
- 试下：点击"✋ 试下"后按提示轮流落子；点对自动前进，点错红叉提示，错两次可用 💡 显示答案
- 显示开关：手数数字、坐标轴、字母/三角标记、局部裁剪 / 全盘（选择会被记住）
- 深链：`reader.html#书id/章id/型序号/图序号` 可直达任意图
