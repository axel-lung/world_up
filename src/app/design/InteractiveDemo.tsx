'use client';

import { LayoutGrid, List } from 'lucide-react';
import { useState } from 'react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Tabs } from '@/components/ui/Tabs';

// Development showcase only: the labels are the mock-up's sample values.
export function InteractiveDemo({ id }: { id: string }) {
  const [tab, setTab] = useState('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  return (
    <>
      <Tabs
        ariaLabel="Filtrer la collection"
        value={tab}
        onValueChange={setTab}
        items={[
          { value: 'all', label: 'Toutes', count: '26 755' },
          { value: 'owned', label: 'Possédées', count: '1 284' },
          { value: 'missing', label: 'Manquantes', count: '25 471' },
          { value: 'duplicates', label: 'Doublons', count: '212' },
        ]}
      />
      <SegmentedControl
        name={`view-${id}`}
        ariaLabel="Affichage"
        value={view}
        onValueChange={setView}
        options={[
          { value: 'grid', label: 'Grille', icon: <LayoutGrid aria-hidden /> },
          { value: 'list', label: 'Liste', icon: <List aria-hidden /> },
        ]}
      />
    </>
  );
}
