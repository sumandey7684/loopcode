import React, { useState } from 'react';
import { Box } from 'ink';
import type { SessionController } from '../../../app/session-controller.js';
import { WelcomeTrust } from './WelcomeTrust.js';
import { AuthMethod } from './AuthMethod.js';
import { ProviderPicker } from './ProviderPicker.js';
import { ApiKeyEntry } from './ApiKeyEntry.js';
import { OAuthFlow } from './OAuthFlow.js';
import { ProxySetup } from './ProxySetup.js';
import { ModelPicker } from './ModelPicker.js';

type Step =
  | { name: 'trust' }
  | { name: 'method' }
  | { name: 'provider' }
  | { name: 'api-key'; providerId: string }
  | { name: 'oauth'; providerId: string; methodIndex: number }
  | { name: 'proxy' }
  | { name: 'model' };

/**
 * Linear wizard with a back stack. Every step must accept Esc to go back and
 * must never leave the process in a half-configured state.
 */
export function Onboarding({
  controller,
  onDone,
  onExit,
}: {
  controller: SessionController;
  onDone: () => void;
  onExit: () => void;
}) {
  const [stack, setStack] = useState<Step[]>([{ name: 'trust' }]);
  const step = stack[stack.length - 1];

  const push = (next: Step) => setStack((s) => [...s, next]);
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  return (
    <Box flexDirection="column">
      {step.name === 'trust' ? (
        <WelcomeTrust controller={controller} onTrusted={() => push({ name: 'method' })} onDecline={onExit} />
      ) : null}

      {step.name === 'method' ? (
        <AuthMethod
          controller={controller}
          onApiOrOAuth={() => push({ name: 'provider' })}
          onProxy={() => push({ name: 'proxy' })}
          onSkip={onDone}
          onBack={back}
        />
      ) : null}

      {step.name === 'provider' ? (
        <ProviderPicker
          controller={controller}
          onApiKey={(providerId) => push({ name: 'api-key', providerId })}
          onOAuth={(providerId, methodIndex) => push({ name: 'oauth', providerId, methodIndex })}
          onBack={back}
        />
      ) : null}

      {step.name === 'api-key' ? (
        <ApiKeyEntry
          controller={controller}
          providerId={step.providerId}
          onSaved={() => push({ name: 'model' })}
          onBack={back}
        />
      ) : null}

      {step.name === 'oauth' ? (
        <OAuthFlow
          controller={controller}
          providerId={step.providerId}
          methodIndex={step.methodIndex}
          onSuccess={() => push({ name: 'model' })}
          onBack={back}
        />
      ) : null}

      {step.name === 'proxy' ? (
        <ProxySetup controller={controller} onReady={() => push({ name: 'model' })} onBack={back} />
      ) : null}

      {step.name === 'model' ? <ModelPicker controller={controller} onDone={onDone} onBack={back} /> : null}
    </Box>
  );
}
