# 腾讯云连接

该项目目前在腾讯云上部署

地址：`ubuntu@82.156.111.54`

TCP 22 端口：可达

主机密钥：已存在于本机 `known_hosts`，严格校验通过

私钥：`C:\Users\TSYG\.ssh\id_ed25519`

远端主机名：`VM-0-15-ubuntu`

登录用户：`ubuntu`

项目目录：`/opt/guzhouyue-blog` 存在

腾讯云上运行的数据库目前为权威数据库

# cloudflare静态前端

地址:https://ziyuexi.top/

# 管理界面

通过cloudflare完成隧道穿透，https://admin.ziyuexi.top/

# 项目架构大体架构和目的

https://ziyuexi.top/posts/cloudflare-%E9%9D%99%E6%80%81%E5%8F%91%E5%B8%83%E9%97%AE%E9%A2%98%E5%A4%8D%E7%9B%98

# 开发要求

1. 构建代码的时候需要添加中文注释，同时单个py文件行数不得大于500行，如果大于需要进行拆分保证人类工程师的可读性

2. 每次的代码构建、修改或者删除都需要写入Change-Log.md中，记录的不要太多，一行就行，记录日期和时间修改内容梗概和修改原因，格式参考Change-Log.md内部的

3. 如果出现了BUG无论是否修复了都需要在Bug-report中登记

