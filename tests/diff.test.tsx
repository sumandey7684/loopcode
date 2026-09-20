import { describe, it, expect } from 'bun:test';
import { StructuredDiff } from '../src/cli/components/StructuredDiff.js';
import React from 'react';

describe('Structured Diff Renderer', () => {
  it('parses diff additions and deletions with correct line numbers', () => {
    const diff = '--- a/file.txt\n+++ b/file.txt\n@@ -10,2 +10,2 @@\n-line one\n+line two\nnormal line';
    const element = StructuredDiff({ diff }) as any;
    expect(element).toBeDefined();

    const boxChildren = React.Children.toArray(element.props.children);
    expect(boxChildren.length).toBe(6); // header(2) + hunk(1) + deletion(1) + addition(1) + normal(1)

    // Verify deletion line (idx 3)
    const deletionNode = boxChildren[3] as any;
    const deletionParts = React.Children.toArray(deletionNode.props.children);
    // deletionParts[0] is <Box><Text color="red">10 </Text></Box>
    const oldLineText = deletionParts[0] as any;
    expect(oldLineText.props.children.props.children).toBe('10 '); // old line number

    // deletionParts[2] is <Text color="red">-line one</Text>
    expect((deletionParts[2] as any).props.children).toBe('-line one');

    // Verify addition line (idx 4)
    const additionNode = boxChildren[4] as any;
    const additionParts = React.Children.toArray(additionNode.props.children);
    // additionParts[1] is <Box><Text color="green">10 </Text></Box>
    const newLineText = additionParts[1] as any;
    expect(newLineText.props.children.props.children).toBe('10 '); // new line number

    // additionParts[2] is <Text color="green">+line two</Text>
    expect((additionParts[2] as any).props.children).toBe('+line two');
  });
});
