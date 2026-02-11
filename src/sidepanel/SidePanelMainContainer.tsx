import { LoginForm } from "@/app/login/LoginForm";
import { isUserAuthenticated } from "@/utils/auth";
import SidePanelExecuteView from "./SidePanelExecuteView";
import {BackgroundGradient} from "@/components/chrome/BackgroundGradient";

function SidePanelMainContainer() {
  return (
      <div className="h-screen relative overflow-auto">
        <div className="absolute inset-0 -z-10">
          <BackgroundGradient />
        </div>

        {!isUserAuthenticated() ? (
            <div className="p-container relative z-10">
              <LoginForm onSuccess={() => window.location.reload()} />
            </div>
        ) : (
            <div className="relative z-10">
              <SidePanelExecuteView />
            </div>
        )}
      </div>
  );
}

export default SidePanelMainContainer;
