import { useState, useEffect } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Toast,
  showToast,
  getPreferenceValues,
  Icon,
  Color,
} from "@raycast/api";
import { getLatestVersion, loadChangelog, updateChangelog } from "./utils/changelog";

interface Preferences {
  apiKey: string;
}

export default function GetLatest() {
  const [isLoading, setIsLoading] = useState(true);
  const [latestVersion, setLatestVersion] = useState<{ version: string; description: string; detailLink?: string } | null>(null);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  
  const preferences = getPreferenceValues<Preferences>();
  
  useEffect(() => {
    async function fetchLatest() {
      try {
        // Try to get the latest version from local data
        const latest = getLatestVersion();
        
        if (latest) {
          setLatestVersion(latest);
          setNeedsUpdate(false);
        } else {
          // If no local data, flag that we need to update
          setNeedsUpdate(true);
          
          // Try to update the changelog and get the latest version
          await updateChangelog(preferences.apiKey);
          const updatedLatest = getLatestVersion();
          setLatestVersion(updatedLatest);
        }
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to get latest version",
          message: String(error),
        });
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchLatest();
  }, [preferences.apiKey]);
  
  const refreshChangelog = async () => {
    setIsLoading(true);
    
    try {
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Updating changelog",
      });
      
      await updateChangelog(preferences.apiKey);
      const updatedLatest = getLatestVersion();
      setLatestVersion(updatedLatest);
      
      toast.style = Toast.Style.Success;
      toast.title = "Changelog updated";
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to update changelog",
        message: String(error),
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Format the markdown for the detail view
  let markdown;
  if (latestVersion) {
    markdown = `# Latest Cursor Update: v${latestVersion.version}

## What's New:

${latestVersion.description}

${latestVersion.detailLink ? `\n[View Full Details](${latestVersion.detailLink})\n` : ''}
---

*Last updated: ${new Date().toLocaleString()}*
`;
  } else if (needsUpdate) {
    markdown = `# No Changelog Data Available

It seems like this is your first time using the extension or the changelog data is missing.

Please use the "Update Changelog" action to download the latest changelog information.
`;
  } else {
    markdown = `# Unable to Retrieve Latest Version

There was a problem retrieving the latest Cursor version information.

Please try the "Refresh" action or check your internet connection.
`;
  }
  
  return (
    <Detail
      markdown={markdown}
      isLoading={isLoading}
      metadata={
        latestVersion ? (
          <Detail.Metadata>
            <Detail.Metadata.Label title="Latest Version" text={latestVersion.version} />
            <Detail.Metadata.TagList title="Status">
              <Detail.Metadata.TagList.Item text="Latest" color={Color.Green} />
            </Detail.Metadata.TagList>
            <Detail.Metadata.Separator />
            <Detail.Metadata.Link
              title="Cursor Website"
              target="https://cursor.com"
              text="Visit Cursor"
            />
            <Detail.Metadata.Link
              title="Full Changelog"
              target="https://cursor.com/changelog"
              text="View Online"
            />
            {latestVersion.detailLink && (
              <Detail.Metadata.Link
                title="Detailed Release Notes"
                target={latestVersion.detailLink}
                text="View Details"
              />
            )}
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          {latestVersion && (
            <Action.CopyToClipboard
              title="Copy Version"
              content={latestVersion.version}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
            />
          )}
          {latestVersion && (
            <Action.CopyToClipboard
              title="Copy Description"
              content={latestVersion.description}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
            />
          )}
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={refreshChangelog}
          />
          <Action.OpenInBrowser
            title="Open Cursor Website"
            url="https://cursor.com"
            shortcut={{ modifiers: ["cmd"], key: "o" }}
          />
          {latestVersion?.detailLink && (
            <Action.OpenInBrowser
              title="Open Detailed Changelog"
              url={latestVersion.detailLink}
              shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
            />
          )}
        </ActionPanel>
      }
    />
  );
} 