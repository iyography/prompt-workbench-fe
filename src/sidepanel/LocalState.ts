export class LocalState{

    private readonly showPrivateAdminKey: string = "nar-showPrivateAdmin";
    private readonly useAtwoodForHubspotVariablesKey: string = "nar-useAtwoodForHubspotVariables";

    isShowPrivateAdmin(): boolean {
        const ret = window.localStorage.getItem(this.showPrivateAdminKey) ?? "false"
        return ret.toLowerCase() === 'true'
    }

    setShowPrivateAdmin(value: boolean): boolean {
        window.localStorage.setItem(this.showPrivateAdminKey, `${value}`);
        return this.isShowPrivateAdmin()
    }

    isUseAtwoodForHubspotVariables(): boolean {
        const ret = window.localStorage.getItem(this.useAtwoodForHubspotVariablesKey) ?? "false"
        return ret.toLowerCase() === 'true'
    }

    setIsUseAtwoodForHubspotVariables(value: boolean): boolean {
        window.localStorage.setItem(this.useAtwoodForHubspotVariablesKey, `${value}`);
        return this.isUseAtwoodForHubspotVariables()
    }
}