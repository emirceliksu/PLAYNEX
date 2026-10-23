'use client';

import { Avatar, IconButton, Modal, ModalContent, ModalTrigger } from '@playnex/ui';
import { Bell } from 'lucide-react';

interface NotificationItem {
  id: string;
  actor: string;
  actorSeed: string;
  text: string;
  when: string;
  unread: boolean;
}

interface NotificationsButtonProps {
  label: string;
  closeLabel: string;
  items: NotificationItem[];
}

export function NotificationsButton({ label, closeLabel, items }: NotificationsButtonProps) {
  const unread = items.filter((item) => item.unread).length;

  return (
    <Modal>
      <ModalTrigger asChild>
        <IconButton label={unread > 0 ? `${label} (${unread})` : label} className="relative">
          <Bell />
          {unread > 0 ? (
            <span
              aria-hidden
              className="absolute top-2 right-2 size-2.5 rounded-full border-2 border-surface-canvas bg-pink-solid"
            />
          ) : null}
        </IconButton>
      </ModalTrigger>
      <ModalContent title={label} closeLabel={closeLabel} size="sm">
        <ul className="-mx-2 flex flex-col">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-md px-2 py-2.5 hover:bg-surface-raised"
            >
              <Avatar name={item.actor} seed={item.actorSeed} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-fg-primary">
                  <span className="font-semibold">{item.actor}</span> {item.text}
                </p>
                <p className="text-label-sm text-fg-muted">{item.when}</p>
              </div>
              {item.unread ? (
                <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-pink-solid" />
              ) : null}
            </li>
          ))}
        </ul>
      </ModalContent>
    </Modal>
  );
}
