import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../button/button';
import { ScoreValue } from '../score-value/score-value';
import { Modal, ModalClose, ModalContent, ModalTrigger } from './modal';

const meta = {
  title: 'Components/Modal',
  component: Modal,
} satisfies Meta<typeof Modal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Confirm: Story = {
  render: () => (
    <Modal>
      <ModalTrigger asChild>
        <Button variant="danger">Oyundan çık</Button>
      </ModalTrigger>
      <ModalContent
        title="Oyundan çıkılsın mı?"
        description="Bu turdaki skor kaydedilmeyecek."
        closeLabel="Kapat"
        size="sm"
        footer={
          <>
            <ModalClose asChild>
              <Button variant="ghost">Vazgeç</Button>
            </ModalClose>
            <ModalClose asChild>
              <Button variant="danger">Çık</Button>
            </ModalClose>
          </>
        }
      />
    </Modal>
  ),
};

export const Result: Story = {
  render: () => (
    <Modal defaultOpen>
      <ModalTrigger asChild>
        <Button variant="secondary">Sonucu göster</Button>
      </ModalTrigger>
      <ModalContent
        title="Oyun bitti"
        closeLabel="Kapat"
        footer={
          <>
            <ModalClose asChild>
              <Button variant="secondary">Kataloğa dön</Button>
            </ModalClose>
            <ModalClose asChild>
              <Button>Yeniden oyna</Button>
            </ModalClose>
          </>
        }
      >
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span className="text-label-sm text-fg-muted uppercase">Skor</span>
          <ScoreValue value={4110} className="text-display-xl" />
          <span className="text-body-sm text-fg-secondary">Rekor: 2.890</span>
        </div>
      </ModalContent>
    </Modal>
  ),
};
