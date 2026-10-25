import type { Meta, StoryObj } from '@storybook/react-vite';

import { TextField } from './text-field';

const meta = {
  title: 'Components/TextField',
  component: TextField,
  parameters: { layout: 'padded' },
  args: { label: 'Takma ad', placeholder: 'ör. GeceKuşu' },
} satisfies Meta<typeof TextField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: { hint: '2–16 karakter; odadaki herkes bunu görür.' },
};

export const Invalid: Story = {
  args: {
    defaultValue: 'a',
    error: 'Takma ad 2–16 karakter olmalı ve özel karakter içermemeli.',
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'GeceKuşu' },
};

export const HiddenLabel: Story = {
  args: { label: 'Oda kodu', hideLabel: true, placeholder: 'ABC123' },
};
