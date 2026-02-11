import { NavBar } from "./NavBar";

export const MainContainer = ({ children }: { children: React.ReactNode }) => (
  <>
    {/* Y-CONTAINER: Children (other than X-CONTAINER) should be full viewport width and have fixed height. They will layout in order top to bottom. All must have class flex-grow-0 and flex-shrink-0 classes applied. */}
    <div className="h-dvh flex flex-col bg-white">
      {/* FULL-WIDTH HEADERS */}
      <NavBar />
      {/* X-CONTAINER: Container will grow vertically to leverage all space not used by headers and footers. Children should have height that leverages all vertically available space (use h-full to do so) and have fixed width. They will layout left to right. */}
      <div className="flex flex-grow overflow-hidden">
        {/* LEFT SIDEBAR(S) [currently none] */}
        {/* MAIN CONTENT: Container will grow horizontally to leverage all space not used by left and right sidebars. */}
        <div className="flex flex-grow overflow-auto bg-white">{children}</div>
        {/* RIGHT SIDEBAR(S) [currently none] */}
      </div>
      {/* FULL-WIDTH FOOTERS  [currently none] */}
    </div>
  </>
);
