/* NOVA OS installer slideshow (Calamares, slideshow API 1 — same API as Debian's show.qml).
 * The chroot hook installs it only if Debian's own show.qml uses this API; otherwise Debian's stays. */
import QtQuick 2.0
import calamares.slideshow 1.0

Presentation {
    id: presentation

    property color bg: "#11161f"
    property color card: "#1a2230"
    property color accent: "#4c93ff"
    property color textMain: "#e8eef7"
    property color textMuted: "#a9b6ca"

    function nextSlide() {
        if (presentation.currentSlide < presentation.slides.length - 1)
            presentation.goToNextSlide();
        else
            presentation.currentSlide = 0;
    }

    Timer {
        interval: 12000
        running: presentation.activatedInCalamares
        repeat: true
        onTriggered: presentation.nextSlide()
    }

    Rectangle {
        anchors.fill: parent
        color: presentation.bg
        z: -1
    }

    Slide {
        Column {
            anchors.centerIn: parent
            width: parent.width * 0.8
            spacing: 18
            Image {
                anchors.horizontalCenter: parent.horizontalCenter
                source: "file:///usr/share/nova/branding/logo.png"
                width: 96
                height: 96
                fillMode: Image.PreserveAspectFit
            }
            Text {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                color: presentation.textMain
                font.pixelSize: 26
                font.bold: true
                wrapMode: Text.WordWrap
                text: "Добро пожаловать в NOVA OS"
            }
            Text {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                color: presentation.textMuted
                font.pixelSize: 15
                wrapMode: Text.WordWrap
                text: "Debian 13 и KDE Plasma 6 на русском языке. Без телеметрии, облачного аккаунта и навязанных приложений."
            }
        }
    }

    Slide {
        Column {
            anchors.centerIn: parent
            width: parent.width * 0.8
            spacing: 14
            Text { width: parent.width; color: presentation.accent; font.pixelSize: 22; font.bold: true; wrapMode: Text.WordWrap
                   text: "Привычно, как в Windows" }
            Text { width: parent.width; color: presentation.textMain; font.pixelSize: 15; wrapMode: Text.WordWrap
                   text: "Win+E — файлы, Win+Shift+S — снимок экрана, Ctrl+Shift+Esc — диспетчер задач, Win+G — игровая панель. Панель внизу, приложения по центру." }
            Text { width: parent.width; color: presentation.textMuted; font.pixelSize: 14; wrapMode: Text.WordWrap
                   text: "Оформление NOVA Air (светлое и тёмное) или киберпанк NEON//SYS с живыми обоями — в «Персонализации»." }
        }
    }

    Slide {
        Column {
            anchors.centerIn: parent
            width: parent.width * 0.8
            spacing: 14
            Text { width: parent.width; color: presentation.accent; font.pixelSize: 22; font.bold: true; wrapMode: Text.WordWrap
                   text: "Всё под рукой в NOVA Control" }
            Text { width: parent.width; color: presentation.textMain; font.pixelSize: 15; wrapMode: Text.WordWrap
                   text: "Драйверы, обновления со снимками Timeshift, защита (брандмауэр включён), дисплеи и частота, звуки, телефон и Android-приложения." }
            Text { width: parent.width; color: presentation.textMuted; font.pixelSize: 14; wrapMode: Text.WordWrap
                   text: "Опасные действия всегда спрашивают подтверждение, а изменения оформления можно откатить." }
        }
    }

    Slide {
        Column {
            anchors.centerIn: parent
            width: parent.width * 0.8
            spacing: 14
            Text { width: parent.width; color: presentation.accent; font.pixelSize: 22; font.bold: true; wrapMode: Text.WordWrap
                   text: "Игры и переход с Windows" }
            Text { width: parent.width; color: presentation.textMain; font.pixelSize: 15; wrapMode: Text.WordWrap
                   text: "Steam и Proton, GameMode и MangoHud, геймпады. Мастер переноса бережно копирует документы, фото и закладки — данные Windows не удаляются." }
            Text { width: parent.width; color: presentation.textMuted; font.pixelSize: 14; wrapMode: Text.WordWrap
                   text: "Не все Windows-программы работают через Wine: для них есть виртуальная машина." }
        }
    }
}
