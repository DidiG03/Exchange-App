import { AdminAccountPanel } from '../components/AdminAccountPanel'
import { PrinterSettingsPanel } from '../components/PrinterSettingsPanel'
import { UpdatePanel } from '../components/UpdatePanel'
import { UserManagementPanel } from '../components/UserManagementPanel'

export function SettingsPage(): React.JSX.Element {
  return (
    <div className="space-y-10">
      <AdminAccountPanel />
      <UserManagementPanel />
      <UpdatePanel />
      <PrinterSettingsPanel />
    </div>
  )
}
