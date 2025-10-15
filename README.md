# 批量图片浮水印工具 · TMT Waterlogo

一个纯前端的批量图片加水印网站。所有处理均在浏览器本地完成，不会上传图片到服务器。支持文本或图片水印、平铺或居中方式，并可一次性打包 ZIP 下载结果。

## 本地开发

- 安装依赖：`npm install`
- 启动开发服务器：`npm run dev`
- 浏览器访问：终端输出的 `http://localhost:5173/`

## 使用说明

- 选择待处理的本地图片（可多选）
- 选择水印类型：文本或图片
- 文本水印：设置内容、字体、字号、颜色、不透明度、角度、是否平铺及间距
- 图片水印：选择水印图片，设置缩放、不透明度、角度、是否平铺及间距
- 预览会基于第一张图片实时展示效果
- 点击“批量处理并下载 ZIP”即可一次性下载处理后的所有图片

## 生产构建

- 构建静态资源：`npm run build`
- 产物目录：`dist/`

## Docker 部署

项目已提供 `Dockerfile`，采用多阶段构建：Node 构建前端产物，Nginx 提供静态服务。

### 构建镜像

```bash
docker build -t tmt-waterlogo:latest .
```

### 运行容器

```bash
docker run -d --name tmt-waterlogo -p 8080:80 tmt-waterlogo:latest
```

然后访问 `http://<服务器IP>:8080/` 即可使用。

### Docker Compose（可选）

```yaml
services:
  web:
    image: tmt-waterlogo:latest
    build: .
    ports:
      - "8080:80"
    restart: unless-stopped
```

## 注意事项

- 图片处理完全在浏览器完成，浏览器内存与性能会影响处理速度，建议分批处理较大的图片集。
- 透明 PNG 能保持透明度；JPEG 会以 92% 品质导出。

Compose 文件

- 新增 docker-compose.yml ，内容如下：
  - version: "3.8"
  - services:
    - waterlogo-web
      - build: . （使用仓库内 Dockerfile 构建）
      - image: waterlogo-web:latest
      - container_name: waterlogo-web
      - ports: 13924:80 （宿主机 13924 → 容器 Nginx 80）
      - restart: unless-stopped
部署命令

- 首次部署
  - git clone <repo_url> && cd tmt-waterlogo-web
  - docker compose up -d --build
  - 访问 http://<服务器IP>:13924/
- 更新上线（仓库有新提交）
  - git pull --rebase
  - docker compose up -d --build
- 查看状态与日志
  - docker compose ps
  - docker compose logs -f
注意事项

- 若 13924 被占用，修改 docker-compose.yml 中 ports 为 "<新的端口>:80" ，重新执行 docker compose up -d --build 。
- 这是静态站点，容器内由 Nginx 提供服务；无需 Node 运行时。
- 如需挂载到子路径（例如 /apps/waterlogo/ ），需在构建前调整 vite.config.js 的 base 值，并重新打包再部署。