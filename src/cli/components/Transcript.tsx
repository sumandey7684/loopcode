import React from 'react';
import { Box, Static } from 'ink';
import type { AppEvent } from '../../app/events.js';
import { TranscriptItem } from './items/TranscriptItem.js';

interface Props {
  committed: AppEvent[];
  live: AppEvent[];
  expandedIds: Set<string>;
}

/**
 * Committed items go through <Static> so they are painted once and never
 * redrawn. Live items sit outside it and re-render freely.
 */
export function Transcript({ committed, live, expandedIds }: Props) {
  return (
    <Box flexDirection="column">
      <Static items={committed}>
        {(event) => <TranscriptItem key={event.id} event={event} expanded={expandedIds.has(event.id)} />}
      </Static>
      {live.map((event) => (
        <TranscriptItem key={event.id} event={event} expanded={expandedIds.has(event.id)} live />
      ))}
    </Box>
  );
}
