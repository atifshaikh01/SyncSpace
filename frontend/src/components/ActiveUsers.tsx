import type { OnlineUser } from '../types'

interface ActiveUsersProps {
  onlineUsers: OnlineUser[]
  connectionStatus: 'connected' | 'connecting' | 'disconnected'
}

export function ActiveUsers({ onlineUsers, connectionStatus }: ActiveUsersProps) {
  return (
    <div className="presence">
      <span className={`sync-dot ${connectionStatus}`} title={connectionStatus} />
      <div className="avatar-stack">
        {onlineUsers.slice(0, 3).map((user) => (
          <span
            key={user.id}
            className="avatar"
            style={{ background: user.color }}
            title={user.name}
          >
            {user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
          </span>
        ))}
        {onlineUsers.length === 0 && <span className="presence-label">You</span>}
        {onlineUsers.length > 3 && <span className="avatar avatar-more">+{onlineUsers.length - 3}</span>}
      </div>
    </div>
  )
}
