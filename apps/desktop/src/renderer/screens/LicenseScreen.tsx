import { LogIn, LogOut, UserRound } from "lucide-react";
import { Header } from "../components/layout/Header";
import { LicensePanel } from "../components/license/LicensePanel";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { useAsyncAction } from "../hooks/use-async-action";
import { useApp } from "../state/context";
import { busyBlocker } from "../state/selectors";

function AccountCard() {
  const { state, actions } = useApp();
  const { auth } = state;
  const sign = useAsyncAction();
  return (
    <Card>
      <CardHeader
        icon={UserRound}
        eyebrow="Account"
        title={auth?.signedIn ? (auth.account ?? "Signed in") : "Not signed in"}
        description={
          auth?.signedIn
            ? `Tenant ${auth.tenantId ?? ""}`
            : "Sign in with a Microsoft account from the tenant you want to document."
        }
        action={
          auth?.signedIn ? (
            <Button
              variant="secondary"
              size="sm"
              icon={LogOut}
              loading={sign.busy === "out"}
              disabled={Boolean(busyBlocker(state))}
              disabledReason={busyBlocker(state)}
              onClick={() => void sign.run("out", () => actions.signOut())}
            >
              Sign out
            </Button>
          ) : (
            <Button
              size="sm"
              icon={LogIn}
              loading={sign.busy === "in"}
              disabled={Boolean(busyBlocker(state))}
              disabledReason={busyBlocker(state)}
              onClick={() => void sign.run("in", () => actions.signIn())}
            >
              Sign in
            </Button>
          )
        }
      />
      {sign.busy === "in" && (
        <p className="text-petrol-600 mt-4 text-xs" role="status">
          Finish signing in in your browser, then return here.
        </p>
      )}
      {sign.error && (
        <Alert tone="danger" className="mt-4">
          {sign.error}
        </Alert>
      )}
    </Card>
  );
}

export function LicenseScreen() {
  return (
    <div className="max-w-4xl space-y-5">
      <Header title="License and account" description="Manage your subscription and the signed in tenant." />
      <AccountCard />
      <LicensePanel />
    </div>
  );
}
