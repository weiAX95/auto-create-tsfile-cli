#!/usr/bin/env node

import { quicktype, InputData, JSONSchemaInput, FetchingJSONSchemaStore } from "quicktype-core";
import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import axios from 'axios';

// 配置文件验证schema
const ConfigSchema = z.object({
  input: z.object({
    // 支持本地文件目录或 API URL
    sources: z.array(z.object({
      type: z.enum(['file', 'api']),
      path: z.string(),
      method: z.enum(['GET', 'POST']).optional(),
      headers: z.record(z.string()).optional(),
    })),
    format: z.enum(['json', 'yaml']).default('json'),
  }),
  output: z.object({
    dir: z.string(),
    // 前端常用类型生成配置
    style: z.enum(['interface', 'type']).default('interface'),
    features: z.object({
      // 生成 Props 类型
      componentProps: z.boolean().default(true),
      // 生成 API 响应类型
      apiResponse: z.boolean().default(true),
      // 生成 Hooks 返回类型
      hookReturnTypes: z.boolean().default(true),
      // 生成状态管理相关类型
      storeTypes: z.boolean().default(false),
    }).default({}),
    // 命名约定
    naming: z.object({
      // Props 类型命名规则
      propsPrefix: z.string().default(''),
      propsSuffix: z.string().default('Props'),
      // API 响应类型命名规则
      responsePrefix: z.string().default(''),
      responseSuffix: z.string().default('Response'),
    }).default({}),
  }),
  documentation: z.object({
    enabled: z.boolean().default(true),
    format: z.enum(['markdown', 'html']).default('markdown'),
    outputDir: z.string().optional(),
    // 文档增强功能
    features: z.object({
      // 添加示例代码
      examples: z.boolean().default(true),
      // 添加类型关系图
      typeGraph: z.boolean().default(true),
      // 添加验证规则说明
      validationRules: z.boolean().default(true),
    }).default({}),
  }).optional(),
});

type Config = z.infer<typeof ConfigSchema>;

class FrontendTypeGenerator {
  private config: Config;
  private spinner: ora.Ora;

  constructor(configPath: string) {
    this.spinner = ora();
    this.config = this.loadConfig(configPath);
  }

  private loadConfig(configPath: string): Config {
    try {
      const configFile = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(configFile) as any;
      return ConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(chalk.red('配置文件验证失败:'));
        error.errors.forEach(err => {
          console.error(chalk.red(`- ${err.path.join('.')}: ${err.message}`));
        });
      } else {
        console.error(chalk.red(`加载配置文件失败: ${error.message}`));
      }
      process.exit(1);
    }
  }

  private async fetchSchema(source: Config['input']['sources'][0]): Promise<object> {
    if (source.type === 'file') {
      const content = fs.readFileSync(source.path, 'utf8');
      return this.config.input.format === 'json' 
        ? JSON.parse(content)
        : yaml.load(content);
    } else {
      const response = await axios({
        method: source.method || 'GET',
        url: source.path,
        headers: source.headers,
      });
      return response.data;
    }
  }

  private async generateTypes(schema: object, name: string): Promise<string> {
    const schemaInput = new JSONSchemaInput(new FetchingJSONSchemaStore());
    
    await schemaInput.addSchema(name, schema);
    
    const inputData = new InputData();
    inputData.addInput(schemaInput);

    const { lines } = await quicktype({
      inputData,
      lang: 'typescript',
      rendererOptions: {
        'just-types': true,
        'runtime-typecheck': true,
      }
    });

    // 根据配置转换类型定义
    let types = lines.join('\n');
    
    if (this.config.output.style === 'type') {
      types = types.replace(/interface/g, 'type').replace(/ {/g, ' = {');
    }

    // 添加Props类型
    if (this.config.output.features.componentProps) {
      const propsType = this.generatePropsType(types, name);
      types = `${types}\n\n${propsType}`;
    }

    // 添加API响应类型
    if (this.config.output.features.apiResponse) {
      const responseType = this.generateResponseType(types, name);
      types = `${types}\n\n${responseType}`;
    }

    return types;
  }

  private generatePropsType(types: string, name: string): string {
    const { propsPrefix, propsSuffix } = this.config.output.naming;
    const baseTypeName = name.charAt(0).toUpperCase() + name.slice(1);
    const propsName = `${propsPrefix}${baseTypeName}${propsSuffix}`;
    
    return `export interface ${propsName} {
  data?: ${baseTypeName};
  loading?: boolean;
  error?: Error;
  onUpdate?: (data: ${baseTypeName}) => void;
}`;
  }

  private generateResponseType(types: string, name: string): string {
    const { responsePrefix, responseSuffix } = this.config.output.naming;
    const baseTypeName = name.charAt(0).toUpperCase() + name.slice(1);
    const responseName = `${responsePrefix}${baseTypeName}${responseSuffix}`;
    
    return `export interface ${responseName} {
  code: number;
  message: string;
  data: ${baseTypeName};
}`;
  }

  private generateDocumentation(types: string, name: string): string {
    const docs: string[] = [];
    const { features } = this.config.documentation;

    // 基本类型文档
    docs.push(`# ${name} 类型定义\n`);
    
    // 解析并记录所有类型定义
    const typeDefinitions = new Map<string, string>();
    const typeRegex = /(?:export )?(?:type|interface) (\w+)(?: [={])([\s\S]*?)(?:}|(?=(?:export )?(?:type|interface)))/g;
    
    let match;
    while ((match = typeRegex.exec(types))) {
      const [_, typeName, definition] = match;
      typeDefinitions.set(typeName, definition);
      
      docs.push(`## ${typeName}\n`);
      docs.push('| 属性 | 类型 | 必填 | 描述 |');
      docs.push('|------|------|------|------|');
      
      // 解析属性
      const propRegex = /(\w+)(\?)?:\s*([^;\n]+)/g;
      let propMatch;
      while ((propMatch = propRegex.exec(definition))) {
        const [_, name, optional, type] = propMatch;
        docs.push(`| ${name} | \`${type.trim()}\` | ${optional ? '否' : '是'} | |`);
      }
      docs.push('\n');

      // 生成示例代码
      if (features?.examples) {
        docs.push('### 示例\n');
        docs.push('```typescript');
        docs.push(this.generateExample(typeName, definition));
        docs.push('```\n');
      }
    }

    // 生成类型关系图
    if (features?.typeGraph) {
      docs.push('## 类型关系图\n');
      docs.push('```mermaid');
      docs.push(this.generateTypeGraph(typeDefinitions));
      docs.push('```\n');
    }

    // 生成验证规则说明
    if (features?.validationRules) {
      docs.push('## 验证规则\n');
      docs.push(this.generateValidationRules(typeDefinitions));
    }

    return docs.join('\n');
  }

  private generateExample(typeName: string, definition: string): string {
    const example = `const example${typeName} = {\n`;
    const props = definition.match(/(\w+)(\?)?:\s*([^;\n]+)/g) || [];
    
    return props.reduce((acc, prop) => {
      const [name, type] = prop.split(':').map(s => s.trim());
      const value = this.getExampleValue(type);
      return `${acc}  ${name}: ${value},\n`;
    }, example) + '};';
  }

  private getExampleValue(type: string): string {
    switch (type) {
      case 'string': return '"example"';
      case 'number': return '123';
      case 'boolean': return 'true';
      case 'Date': return 'new Date()';
      default: return '{}';
    }
  }

  private generateTypeGraph(types: Map<string, string>): string {
    const graph = ['graph TD;'];
    
    types.forEach((definition, typeName) => {
      // 查找类型引用
      const references = Array.from(types.keys())
        .filter(type => definition.includes(type));
      
      references.forEach(refType => {
        graph.push(`  ${typeName}-->${refType}`);
      });
    });
    
    return graph.join('\n');
  }

  private generateValidationRules(types: Map<string, string>): string {
    const rules: string[] = [];
    
    types.forEach((definition, typeName) => {
      rules.push(`### ${typeName} 验证规则\n`);
      
      const propRegex = /(\w+)(\?)?:\s*([^;\n]+)/g;
      let match;
      
      while ((match = propRegex.exec(definition))) {
        const [_, name, optional, type] = match;
        rules.push(`- \`${name}\`: ${this.getValidationRule(type, optional)}`);
      }
      
      rules.push('');
    });
    
    return rules.join('\n');
  }

  private getValidationRule(type: string, optional?: string): string {
    const rules = [];
    
    if (!optional) {
      rules.push('必填');
    }
    
    switch (type.trim()) {
      case 'string':
        rules.push('字符串类型');
        break;
      case 'number':
        rules.push('数字类型');
        break;
      case 'boolean':
        rules.push('布尔类型');
        break;
      case 'Date':
        rules.push('日期类型');
        break;
    }
    
    return rules.join(', ');
  }

  public async run() {
    this.spinner.start('开始生成类型文件');

    try {
      const outputDir = path.resolve(this.config.output.dir);
      const docDir = this.config.documentation?.outputDir 
        ? path.resolve(this.config.documentation.outputDir)
        : path.join(outputDir, 'docs');

      // 创建输出目录
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      if (this.config.documentation?.enabled && !fs.existsSync(docDir)) {
        fs.mkdirSync(docDir, { recursive: true });
      }

      // 处理每个数据源
      for (const source of this.config.input.sources) {
        const name = path.basename(source.path, path.extname(source.path));
        this.spinner.text = `正在处理 ${name}`;
        
        try {
          // 获取schema
          const schema = await this.fetchSchema(source);
          
          // 生成类型
          const types = await this.generateTypes(schema, name);
          const outputPath = path.join(outputDir, `${name}.ts`);
          fs.writeFileSync(outputPath, types);

          // 生成文档
          if (this.config.documentation?.enabled) {
            const docs = this.generateDocumentation(types, name);
            const docPath = path.join(
              docDir, 
              `${name}.${this.config.documentation.format}`
            );
            fs.writeFileSync(docPath, docs);
          }
        } catch (error) {
          console.warn(chalk.yellow(
            `处理 ${name} 时出现错误: ${error.message}`
          ));
        }
      }

      this.spinner.succeed('类型文件生成完成');
    } catch (error) {
      this.spinner.fail('生成过程中出现错误');
      console.error(chalk.red(error.message));
      process.exit(1);
    }
  }
}

// CLI 命令行配置
const program = new Command();

program
  .name('frontend-type-gen')
  .description('前端类型生成工具')
  .version('1.0.0')
  .option('-c, --config <path>', '配置文件路径', './type-gen.config.yml')
  .option('-v, --verbose', '显示详细日志')
  .action(async (options) => {
    try {
      const generator = new FrontendTypeGenerator(options.config);
      await generator.run();
    } catch (error) {
      console.error(chalk.red(`执行失败: ${error.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
