# Frontend Type Generator 使用文档

## 目录
- [安装](#安装)
- [快速开始](#快速开始)
- [配置文件详解](#配置文件详解)
- [使用场景示例](#使用场景示例)
- [高级特性](#高级特性)
- [常见问题](#常见问题)

## 安装

### 从 NPM 安装
```bash
# 使用 npm
npm install -D @your-org/frontend-type-gen

# 使用 yarn
yarn add -D @your-org/frontend-type-gen

# 使用 pnpm
pnpm add -D @your-org/frontend-type-gen
```

### 从源码安装
```bash
git clone <repository-url>
cd frontend-type-gen
npm install
npm link
```

## 快速开始

1. 创建配置文件 `type-gen.config.yml`:
```yaml
input:
  sources:
    - type: file
      path: ./schemas/user.json
  format: json
output:
  dir: ./src/types
  style: interface
documentation:
  enabled: true
  format: markdown
  outputDir: ./docs
```

2. 创建示例 JSON Schema (`schemas/user.json`):
```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "number"
    },
    "name": {
      "type": "string"
    },
    "email": {
      "type": "string",
      "format": "email"
    }
  },
  "required": ["id", "name"]
}
```

3. 运行生成命令:
```bash
npx frontend-type-gen
```

## 配置文件详解

### 输入配置 (input)
```yaml
input:
  # 数据源配置
  sources:
    # 本地文件
    - type: file
      path: ./schemas/user.json
    
    # API 端点
    - type: api
      path: https://api.example.com/schema/product
      method: GET  # 可选, 默认 GET
      headers:     # 可选
        Authorization: "Bearer token"
  
  # 输入格式: json 或 yaml
  format: json
```

### 输出配置 (output)
```yaml
output:
  # 输出目录
  dir: ./src/types
  
  # 类型风格: interface 或 type
  style: interface
  
  # 功能特性
  features:
    # 是否生成组件 Props 类型
    componentProps: true
    # 是否生成 API 响应类型
    apiResponse: true
    # 是否生成 Hooks 返回类型
    hookReturnTypes: true
    # 是否生成状态管理相关类型
    storeTypes: false
  
  # 命名规则
  naming:
    propsPrefix: "I"      # Props 类型前缀
    propsSuffix: "Props"  # Props 类型后缀
    responsePrefix: "I"   # 响应类型前缀
    responseSuffix: "Response" # 响应类型后缀
```

### 文档配置 (documentation)
```yaml
documentation:
  # 是否启用文档生成
  enabled: true
  
  # 文档格式: markdown 或 html
  format: markdown
  
  # 文档输出目录 (可选，默认为 {output.dir}/docs)
  outputDir: ./docs
  
  # 文档功能特性
  features:
    # 是否生成示例代码
    examples: true
    # 是否生成类型关系图
    typeGraph: true
    # 是否生成验证规则说明
    validationRules: true
```

## 使用场景示例

### 1. 从 API 响应生成类型
```yaml
input:
  sources:
    - type: api
      path: https://api.example.com/users
      headers:
        Authorization: "Bearer ${YOUR_TOKEN}"
output:
  dir: ./src/types
  features:
    apiResponse: true
```

生成结果:
```typescript
export interface User {
  id: number;
  name: string;
  email: string;
}

export interface UserResponse {
  code: number;
  message: string;
  data: User;
}
```

### 2. 生成 React 组件 Props 类型
```yaml
output:
  features:
    componentProps: true
  naming:
    propsPrefix: "I"
    propsSuffix: "Props"
```

生成结果:
```typescript
export interface IUserProps {
  data?: User;
  loading?: boolean;
  error?: Error;
  onUpdate?: (data: User) => void;
}
```

## 高级特性

### 1. 自定义类型转换
工具会自动处理常见的类型映射：
- `string` -> `string`
- `number` -> `number`
- `boolean` -> `boolean`
- `array` -> `Array<T>` 或 `T[]`
- `object` -> `interface` 或 `type`

### 2. 文档增强
- 类型关系图：使用 Mermaid.js 生成类型之间的关系图
- 示例代码：自动生成类型的示例使用代码
- 验证规则：生成每个字段的验证规则说明

### 3. 错误处理
工具会优雅地处理以下错误：
- 配置文件验证失败
- Schema 解析错误
- API 请求失败
- 文件读写错误

## 常见问题

### 1. 类型生成失败
检查：
- JSON Schema 格式是否正确
- API 端点是否可访问
- 配置文件格式是否正确

### 2. 文档生成不完整
确保：
- 开启了相应的文档功能
- 输出目录具有写入权限
- Schema 包含足够的信息

### 3. 命名冲突
解决方案：
- 使用 `naming` 配置自定义类型名称
- 调整源文件名避免冲突
- 使用不同的输出目录

## 命令行选项

```bash
frontend-type-gen [options]

选项：
  -c, --config <path>  配置文件路径 (默认: "./type-gen.config.yml")
  -v, --verbose        显示详细日志
  --version           显示版本号
  -h, --help          显示帮助信息
```
