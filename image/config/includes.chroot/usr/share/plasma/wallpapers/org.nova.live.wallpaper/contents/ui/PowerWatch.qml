// Reports whether the computer runs on battery (Plasma "powermanagement" data engine).
import QtQuick
import org.kde.plasma.plasma5support as P5Support

Item {
    id: watch
    property bool onBattery: false

    P5Support.DataSource {
        id: pm
        engine: "powermanagement"
        connectedSources: ["AC Adapter"]
        interval: 0
        onNewData: (sourceName, data) => {
            if (sourceName === "AC Adapter" && data !== undefined) {
                watch.onBattery = data["Plugged in"] === false;
            }
        }
    }
}
