import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import JavaScript from 'tree-sitter-javascript';

export interface Symbol {
  id: string;
  name: string;
  type: 'function' | 'class' | 'interface' | 'variable' | 'import';
  path: string;
  lineStart: number;
  lineEnd: number;
  signature: string;
  docstring?: string;
  children: string[];
}

export class TreeSitterParser {
  private parser: Parser;

  constructor(language: 'typescript' | 'javascript' = 'typescript') {
    this.parser = new Parser();
    if (language === 'typescript') {
      this.parser.setLanguage(TypeScript.typescript);
    } else {
      this.parser.setLanguage(JavaScript);
    }
  }

  parse(source: string, filePath: string): Symbol[] {
    const tree = this.parser.parse(source);
    return this.walkTree(tree.rootNode, filePath);
  }

  private walkTree(node: Parser.SyntaxNode, filePath: string): Symbol[] {
    const symbols: Symbol[] = [];

    if (
      node.type === 'class_declaration' ||
      node.type === 'function_declaration' ||
      node.type === 'lexical_declaration'
    ) {
      let nameNode = node.childForFieldName('name');
      if (!nameNode && node.type === 'lexical_declaration') {
        const declarator = node.children.find((c) => c.type === 'variable_declarator');
        if (declarator) {
          nameNode = declarator.childForFieldName('name');
        }
      }
      if (!nameNode) nameNode = node.children.find((c) => c.type === 'identifier') || null;

      if (nameNode) {
        let type: Symbol['type'] = 'variable';
        if (node.type === 'class_declaration') type = 'class';
        if (node.type === 'function_declaration') type = 'function';

        symbols.push({
          id: `${filePath}#${nameNode.text}`,
          name: nameNode.text,
          type,
          path: filePath,
          lineStart: node.startPosition.row + 1,
          lineEnd: node.endPosition.row + 1,
          signature: `${type} ${nameNode.text}`,
          children: [],
        });
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        symbols.push(...this.walkTree(child, filePath));
      }
    }

    return symbols;
  }
}
