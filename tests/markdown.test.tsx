import { describe, it, expect } from 'bun:test';
import { parseMarkdown } from '../src/cli/components/Markdown.js';
import React from 'react';

describe('Markdown React Parser', () => {
  it('parses headers correctly into styled text nodes', () => {
    const text = '### My Header';
    const element = parseMarkdown(text) as any;
    expect(element).toBeDefined();
    expect(element.type).toBeDefined();

    // Check children array of the outer Box
    const boxChildren = React.Children.toArray(element.props.children);
    expect(boxChildren.length).toBe(1);

    const headerTextNode = boxChildren[0] as any;
    expect(headerTextNode.props.bold).toBe(true);
    expect(headerTextNode.props.color).toBe('cyan');
    expect(headerTextNode.props.children).toBe('My Header');
  });

  it('parses lists correctly into bullet points', () => {
    const text = '- Item 1\n* Item 2';
    const element = parseMarkdown(text) as any;
    const boxChildren = React.Children.toArray(element.props.children);
    expect(boxChildren.length).toBe(2);

    const firstItem = boxChildren[0] as any;
    expect(firstItem.props.color).toBe('white');
    // It should render bullet point symbol •
    const lineContent = firstItem.props.children;
    expect(lineContent[0]).toBe('• ');
  });

  it('parses inline styles like bold and code correctly', () => {
    const text = 'This is **bold** and `code` inline.';
    const element = parseMarkdown(text) as any;
    const boxChildren = React.Children.toArray(element.props.children);
    const lineNode = boxChildren[0] as any;

    const inlineParts = React.Children.toArray(lineNode.props.children);
    expect(inlineParts.length).toBe(5); // "This is ", "bold", " and ", "code", " inline."

    const boldPart = inlineParts[1] as any;
    expect(boldPart.props.bold).toBe(true);
    expect(boldPart.props.children).toBe('bold');

    const codePart = inlineParts[3] as any;
    expect(codePart.props.color).toBe('yellow');
    expect(codePart.props.backgroundColor).toBe('black');
  });

  it('caches the parsed element for identical text', () => {
    const text = 'Test caching behavior';
    const firstParse = parseMarkdown(text);
    const secondParse = parseMarkdown(text);
    expect(firstParse).toBe(secondParse); // References should be identical
  });
});
