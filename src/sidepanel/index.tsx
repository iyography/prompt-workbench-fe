import Providers from "@/app/providers";
import SidePanelMainContainer from "@/sidepanel/SidePanelMainContainer";

import "./font.css";

function SidePanelRoot() {
  return (
    <Providers>
      <SidePanelMainContainer />
    </Providers>
  );
}

export default SidePanelRoot;
