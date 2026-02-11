import {ChangeEvent, useState} from 'react';
import {LocalState} from "@/sidepanel/LocalState";


const localState = new LocalState();

export function togglePrivateAdminView() {
    const event = new CustomEvent("toggle-private-admin-view", {});
    window.dispatchEvent(event)
}



export function PrivateAdminView() {
    const [showPrivateAdminView, setShowPrivateAdminView] = useState(localState.isShowPrivateAdmin());
    const [useAtwood, setUseAtwood] = useState(localState.isUseAtwoodForHubspotVariables());


    window.addEventListener('toggle-private-admin-view', function (): boolean {
        const newVal = !showPrivateAdminView;
        localState.setShowPrivateAdmin(newVal);
        setShowPrivateAdminView(newVal)
        return false;
    })
    if (!showPrivateAdminView) {
        return (<></>)
    }
    const changeUseAtwood = (e:  any) => {
        setUseAtwood(localState.setIsUseAtwoodForHubspotVariables(e?.target?.checked))

    }
    return (<div>
        <form>
            <label>Use atwood: <input type="checkbox" checked={useAtwood} onChange={changeUseAtwood}/></label>
        </form>
    </div>);
}