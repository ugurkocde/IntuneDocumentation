import { EnterpriseApp } from "~/components/enterprise/app";
import "~/styles/enterprise.css";
export const metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};
export default function EnterprisePage() {
  return <EnterpriseApp />;
}
