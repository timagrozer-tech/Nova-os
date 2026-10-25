// Settings page: System Settings → Wallpaper → NOVA Live.
import QtQuick
import QtQuick.Controls as QQC2
import QtQuick.Layouts
import org.kde.kirigami as Kirigami

Kirigami.FormLayout {
    id: page

    property string cfg_Scene: "sky"
    property int cfg_Fps: 30
    property real cfg_Speed: 1.0
    property bool cfg_Paused: false
    property bool cfg_PauseOnBattery: true
    property bool cfg_ShowClock: false
    property real cfg_Latitude: 55.75
    property real cfg_Longitude: 37.62

    readonly property var scenes: [
        { value: "sky", text: "Живое небо — настоящее Солнце, Луна и звёзды" },
        { value: "aurora", text: "Северное сияние" },
        { value: "sakura", text: "Сакура на рассвете" },
        { value: "ocean", text: "Лунный океан" }
    ]

    QQC2.ComboBox {
        Kirigami.FormData.label: "Обои:"
        model: page.scenes
        textRole: "text"
        valueRole: "value"
        Component.onCompleted: currentIndex = Math.max(0, indexOfValue(page.cfg_Scene))
        onActivated: page.cfg_Scene = currentValue
    }

    QQC2.SpinBox {
        Kirigami.FormData.label: "Кадров в секунду:"
        from: 5
        to: 60
        stepSize: 5
        value: page.cfg_Fps
        onValueModified: page.cfg_Fps = value
    }

    RowLayout {
        Kirigami.FormData.label: "Скорость:"
        QQC2.Slider {
            Layout.preferredWidth: Kirigami.Units.gridUnit * 10
            from: 0.2
            to: 3.0
            stepSize: 0.1
            value: page.cfg_Speed
            onMoved: page.cfg_Speed = Math.round(value * 10) / 10
        }
        QQC2.Label { text: page.cfg_Speed.toFixed(1) + "×" }
    }

    QQC2.CheckBox {
        Kirigami.FormData.label: "Энергосбережение:"
        text: "Останавливать анимацию при работе от батареи"
        checked: page.cfg_PauseOnBattery
        onToggled: page.cfg_PauseOnBattery = checked
    }

    QQC2.CheckBox {
        text: "Пауза"
        checked: page.cfg_Paused
        onToggled: page.cfg_Paused = checked
    }

    QQC2.CheckBox {
        Kirigami.FormData.label: "Дополнительно:"
        text: "Часы на обоях"
        checked: page.cfg_ShowClock
        onToggled: page.cfg_ShowClock = checked
    }

    QQC2.Label {
        Layout.maximumWidth: Kirigami.Units.gridUnit * 24
        wrapMode: Text.WordWrap
        opacity: 0.75
        text: "Для «Живого неба» место берётся из часового пояса: " + page.cfg_Latitude.toFixed(2) + "°, "
              + page.cfg_Longitude.toFixed(2) + "°. Положение Солнца и фаза Луны считаются на компьютере, без интернета."
    }
}
