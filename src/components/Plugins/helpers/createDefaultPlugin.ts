import { ThPlugin } from "../PluginRegistry";
import { ThActionsKeys, ThSettingsKeys } from "@/preferences/models";

import { StatefulAnnotationsTrigger } from "../../Actions/Annotations/StatefulAnnotationsTrigger";
import { StatefulAnnotationsContainer } from "../../Actions/Annotations/StatefulAnnotationsContainer";
import { StatefulFullscreenTrigger } from "../../Actions/Fullscreen/StatefulFullscreenTrigger";
import { StatefulJumpToPositionTrigger } from "../../Actions/JumpToPosition/StatefulJumpToPositionTrigger";
import { StatefulJumpToPositionContainer } from "../../Actions/JumpToPosition/StatefulJumpToPositionContainer";
import { StatefulReadingTimerTrigger } from "../../Actions/ReadingTimer/StatefulReadingTimerTrigger";
import { StatefulReadingTimerContainer } from "../../Actions/ReadingTimer/StatefulReadingTimerContainer";
import { StatefulSettingsTrigger } from "../../Actions/Settings/StatefulSettingsTrigger";
import { StatefulVisualSettingsContainer } from "../../Actions/Settings/StatefulVisualSettingsContainer";
import { StatefulTocTrigger } from "../../Actions/Toc/StatefulTocTrigger";
import { StatefulTocContainer } from "../../Actions/Toc/StatefulTocContainer";

import { StatefulColumns } from "../../Epub/Settings/StatefulColumns";
import { StatefulFontFamily } from "../../Settings/Text/StatefulFontFamily";
import { UnstableStatefulFontWeight } from "../../Settings/Text/StatefulFontWeight";
import { StatefulHyphens } from "../../Settings/Text/StatefulHyphens";
import { StatefulLayout } from "../../Epub/Settings/StatefulLayout";
import { StatefulLetterSpacing } from "../../Settings/Spacing/StatefulLetterSpacing";
import { StatefulLineHeight } from "../../Settings/Spacing/StatefulLineHeight";
import { StatefulMarginHorizontal } from "../../Epub/Settings/StatefulMarginHorizontal";
import { StatefulParagraphIndent } from "../../Settings/Spacing/StatefulParagraphIndent";
import { StatefulParagraphSpacing } from "../../Settings/Spacing/StatefulParagraphSpacing";
import { StatefulPublisherStyles } from "../../Settings/StatefulPublisherStyles";
import { StatefulSpacingGroup } from "../../Settings/Spacing/StatefulSpacingGroup";
import { StatefulSpacingPresets } from "../../Settings/Spacing/StatefulSpacingPresets";
import { StatefulSpreadOffset } from "../../Epub/Settings/StatefulSpreadOffset";
import { StatefulTextAlign } from "../../Settings/Text/StatefulTextAlign";
import { StatefulTextGroup } from "../../Settings/Text/StatefulTextGroup";
import { StatefulTextNormalize } from "../../Settings/Text/StatefulTextNormalize";
import { StatefulLigatures } from "../../Settings/Text/StatefulLigatures";
import { StatefulNoRuby } from "../../Settings/Text/StatefulNoRuby";
import { StatefulTheme } from "../../Settings/StatefulTheme";
import { StatefulWordSpacing } from "../../Settings/Spacing/StatefulWordSpacing";
import { StatefulZoom } from "../../Settings/StatefulZoom";

export const createDefaultPlugin = (): ThPlugin => {
  return {
    id: "core",
    name: "Core Components",
    description: "Default components for Thorium Web Epub StatefulReader",
    version: "1.5.5",
    components: {
      actions: {
        [ThActionsKeys.annotations]: {
          Trigger: StatefulAnnotationsTrigger,
          Target: StatefulAnnotationsContainer
        },
        [ThActionsKeys.fullscreen]: {
          Trigger: StatefulFullscreenTrigger
        },
        [ThActionsKeys.jumpToPosition]: {
          Trigger: StatefulJumpToPositionTrigger,
          Target: StatefulJumpToPositionContainer
        },
        [ThActionsKeys.readingTimer]: {
          Trigger: StatefulReadingTimerTrigger,
          Target: StatefulReadingTimerContainer
        },
        [ThActionsKeys.settings]: {
          Trigger: StatefulSettingsTrigger,
          Target: StatefulVisualSettingsContainer
        },
        [ThActionsKeys.toc]: {
          Trigger: StatefulTocTrigger,
          Target: StatefulTocContainer
        }
      },
      settings: {
        [ThSettingsKeys.columns]: {
          Comp: StatefulColumns
        },
        [ThSettingsKeys.fontFamily]: {
          Comp: StatefulFontFamily,
          type: "text"
        },
        [ThSettingsKeys.fontWeight]: {
          Comp: UnstableStatefulFontWeight,
          type: "text"
        },
        [ThSettingsKeys.hyphens]: {
          Comp: StatefulHyphens,
          type: "text"
        },
        [ThSettingsKeys.layout]: {
          Comp: StatefulLayout
        },
        [ThSettingsKeys.letterSpacing]: {
          Comp: StatefulLetterSpacing,
          type: "spacing"
        },
        [ThSettingsKeys.lineHeight]: {
          Comp: StatefulLineHeight,
          type: "spacing"
        },
        [ThSettingsKeys.marginHorizontal]: {
          Comp: StatefulMarginHorizontal
        },
        [ThSettingsKeys.paragraphIndent]: {
          Comp: StatefulParagraphIndent,
          type: "spacing"
        },
        [ThSettingsKeys.paragraphSpacing]: {
          Comp: StatefulParagraphSpacing,
          type: "spacing"
        },
        [ThSettingsKeys.publisherStyles]: {
          Comp: StatefulPublisherStyles,
          type: "spacing"
        },
        [ThSettingsKeys.spacingGroup]: {
          Comp: StatefulSpacingGroup,
        },
        [ThSettingsKeys.spacingPresets]: {
          Comp: StatefulSpacingPresets,
          type: "spacing"
        },
        [ThSettingsKeys.spreadOffset]: {
          Comp: StatefulSpreadOffset
        },
        [ThSettingsKeys.textAlign]: {
          Comp: StatefulTextAlign,
          type: "text"
        },
        [ThSettingsKeys.textGroup]: {
          Comp: StatefulTextGroup
        },
        [ThSettingsKeys.textNormalize]: {
          Comp: StatefulTextNormalize,
          type: "text"
        },
        [ThSettingsKeys.ligatures]: {
          Comp: StatefulLigatures,
          type: "text"
        },
        [ThSettingsKeys.noRuby]: {
          Comp: StatefulNoRuby,
          type: "text"
        },
        [ThSettingsKeys.theme]: {
          Comp: StatefulTheme
        },
        [ThSettingsKeys.wordSpacing]: {
          Comp: StatefulWordSpacing,
          type: "spacing"
        },
        [ThSettingsKeys.zoom]: {
          Comp: StatefulZoom
        }
      }
    }
  };
};