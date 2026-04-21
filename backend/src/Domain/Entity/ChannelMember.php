<?php
declare(strict_types=1);
namespace App\Domain\Entity;

use Doctrine\ORM\Mapping as ORM;
use Ramsey\Uuid\Uuid;

/**
 * Channel membership row.
 *
 * Stores per-user-per-channel state. Besides the basic (channel, user, role)
 * identity, this is where we track each member's *personal* view on the
 * channel: what they've read, whether they've muted it, whether they've
 * pinned it, whether they've archived it. These are strictly per-member
 * and never shared across the channel.
 *
 * Fields:
 *   role         — 'admin' | 'member'. Admins can add/remove members and
 *                  edit channel metadata; members can only post and leave.
 *   last_read_at — Timestamp of the most recent message the user has seen.
 *                  Null until the first visit. Used by UnreadCountAction
 *                  to compute real unread counts: messages where
 *                  created_at > last_read_at count as unread.
 *   is_muted     — If true, the user gets no push notifications for this
 *                  channel's messages. Unread badges still show in-app.
 *                  Matches Slack / WhatsApp mute semantics.
 *   is_pinned    — If true, this channel floats to the top of the user's
 *                  channel list. Purely a display-order hint.
 *   archived_at  — If non-null, the user has archived this channel from
 *                  their primary list. Channel still exists, messages still
 *                  arrive, but the row is hidden from the default list
 *                  view. Stored as a timestamp (not bool) so UIs can show
 *                  'archived 3 days ago' and we can auto-unarchive on new
 *                  mention if we ever want to.
 */
#[ORM\Entity]
#[ORM\Table(name: 'channel_members')]
#[ORM\UniqueConstraint(name: 'uniq_channel_member', columns: ['channel_id', 'user_id'])]
#[ORM\Index(name: 'idx_chmem_user_archived', columns: ['user_id', 'archived_at'])]
#[ORM\HasLifecycleCallbacks]
class ChannelMember
{
    use TimestampsTrait;

    #[ORM\Id]
    #[ORM\Column(type: 'string', length: 36)]
    private string $id;

    #[ORM\ManyToOne(targetEntity: Channel::class)]
    #[ORM\JoinColumn(name: 'channel_id', referencedColumnName: 'id', nullable: false)]
    private Channel $channel;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id', nullable: false)]
    private User $user;

    #[ORM\Column(type: 'string', length: 20, options: ['default' => 'member'])]
    private string $role = 'member'; // 'admin' | 'member'

    #[ORM\Column(name: 'last_read_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $lastReadAt = null;

    #[ORM\Column(name: 'is_muted', type: 'boolean', options: ['default' => false])]
    private bool $isMuted = false;

    #[ORM\Column(name: 'is_pinned', type: 'boolean', options: ['default' => false])]
    private bool $isPinned = false;

    #[ORM\Column(name: 'archived_at', type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $archivedAt = null;

    public function __construct() { $this->id = Uuid::uuid4()->toString(); }

    public function getId(): string { return $this->id; }
    public function getChannel(): Channel { return $this->channel; }
    public function setChannel(Channel $v): void { $this->channel = $v; }
    public function getUser(): User { return $this->user; }
    public function setUser(User $v): void { $this->user = $v; }
    public function getRole(): string { return $this->role; }
    public function setRole(string $v): void { $this->role = $v; }

    public function getLastReadAt(): ?\DateTimeImmutable { return $this->lastReadAt; }
    public function setLastReadAt(?\DateTimeImmutable $v): void { $this->lastReadAt = $v; }

    public function isMuted(): bool { return $this->isMuted; }
    public function setIsMuted(bool $v): void { $this->isMuted = $v; }

    public function isPinned(): bool { return $this->isPinned; }
    public function setIsPinned(bool $v): void { $this->isPinned = $v; }

    public function getArchivedAt(): ?\DateTimeImmutable { return $this->archivedAt; }
    public function setArchivedAt(?\DateTimeImmutable $v): void { $this->archivedAt = $v; }
    public function isArchived(): bool { return $this->archivedAt !== null; }

    public function toArray(): array
    {
        return [
            'id'            => $this->id,
            'channel_id'    => $this->channel->getId(),
            'user_id'       => $this->user->getId(),
            'user_name'     => $this->user->getFullName(),
            'email'         => $this->user->getEmail(),
            'role'          => $this->role,
            'last_read_at'  => $this->lastReadAt?->format('Y-m-d H:i:s'),
            'is_muted'      => $this->isMuted,
            'is_pinned'     => $this->isPinned,
            'archived_at'   => $this->archivedAt?->format('Y-m-d H:i:s'),
            'created_at'    => $this->createdAt->format('Y-m-d H:i:s'),
        ];
    }
}
