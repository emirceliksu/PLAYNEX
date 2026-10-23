import type { Meta, StoryObj } from '@storybook/react-vite';
import { Gamepad2, Swords, Users } from 'lucide-react';
import { useState } from 'react';

import { FilterChip, FilterGroup } from './filter-chip';

const meta = {
  title: 'Components/FilterChip',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

function SingleExample() {
  const [value, setValue] = useState('all');
  return (
    <FilterGroup
      type="single"
      value={value}
      aria-label="Tür"
      onValueChange={(next) => {
        if (next) setValue(next);
      }}
    >
      <FilterChip value="all">Hepsi</FilterChip>
      <FilterChip value="arcade">Arcade</FilterChip>
      <FilterChip value="puzzle">Bulmaca</FilterChip>
      <FilterChip value="strategy">Strateji</FilterChip>
      <FilterChip value="racing" disabled>
        Yarış
      </FilterChip>
    </FilterGroup>
  );
}

export const Single: Story = {
  render: () => <SingleExample />,
};

export const Multiple: Story = {
  render: () => (
    <FilterGroup type="multiple" defaultValue={['solo']} aria-label="Mod">
      <FilterChip value="solo">
        <Gamepad2 aria-hidden />
        Tek kişilik
      </FilterChip>
      <FilterChip value="1v1">
        <Swords aria-hidden />
        1v1
      </FilterChip>
      <FilterChip value="party">
        <Users aria-hidden />
        Parti
      </FilterChip>
    </FilterGroup>
  ),
};
