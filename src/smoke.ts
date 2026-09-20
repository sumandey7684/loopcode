import { createOpencode } from '@opencode-ai/sdk';

async function runSmokeTest() {
  console.log('Starting OpenCode Server...');
  const opencode = await createOpencode();
  const client = opencode.client;

  try {
    console.log('Creating session...');
    const { data: session, error: createError } = await client.session.create({
      body: { title: 'System Prompt Smoke Test' },
    });

    if (!session || createError) throw new Error('Failed to create session: ' + JSON.stringify(createError));

    console.log(`Session created: ${session.id}`);

    const systemPrompt =
      'You are an AI that speaks strictly in ALL CAPS. You must ignore any other instructions about casing. YOUR ENTIRE RESPONSE MUST BE IN ALL CAPS.';

    console.log('Sending noReply message with system prompt...');
    // Inject the system prompt
    await client.session.prompt({
      path: { id: session.id },
      body: {
        noReply: true,
        system: systemPrompt,
        parts: [{ type: 'text', text: 'This is a hidden setup message.' }],
      },
    });

    console.log('Sending actual prompt...');
    // Send the actual prompt
    const { data: result, error: promptError } = await client.session.prompt({
      path: { id: session.id },
      body: {
        parts: [{ type: 'text', text: 'Tell me a short joke about a programmer.' }],
      },
    });

    if (promptError) console.error('Prompt error:', promptError);

    const responseText = (result?.info as any)?.text || 'No response text found';

    console.log('\n--- RESPONSE ---');
    console.log(responseText);
    console.log('----------------\n');

    if (
      responseText === responseText.toUpperCase() &&
      responseText.length > 0 &&
      responseText !== 'No response text found'
    ) {
      console.log(
        '✅ SMOKE TEST PASSED: The model responded in ALL CAPS, confirming it respected the system prompt override.',
      );
    } else {
      console.log(
        '❌ SMOKE TEST FAILED: The model did NOT respond in ALL CAPS. The `system` field might be ignored or not fully respected as a system instruction.',
      );
    }
  } catch (error: any) {
    console.error('Error during smoke test:', error.message || error);
    if (error.response) {
      console.error(await error.response.text());
    }
  } finally {
    console.log('Closing OpenCode Server...');
    opencode.server.close();
  }
}

runSmokeTest();
