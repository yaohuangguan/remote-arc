class RemotelinkGo < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.5.1"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/go-agent-v0.5.1/remotelink-go-v0.5.1-darwin-arm64", using: :nounzip
      sha256 "e594286f731db7ba5b1353b156292cf6bd59021997092b58e0bff44913719c09"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/go-agent-v0.5.1/remotelink-go-v0.5.1-darwin-amd64", using: :nounzip
      sha256 "64b45a9a2c5545002a24cac763468395e6a0e13645b792fc0e53ced0da80d437"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/go-agent-v0.5.1/remotelink-go-v0.5.1-linux-arm64", using: :nounzip
      sha256 "fde85eda6dacecd281ccc180804d39a9f4de089d135008aae2c8ff346dbaf7fa"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/go-agent-v0.5.1/remotelink-go-v0.5.1-linux-amd64", using: :nounzip
      sha256 "2eadce2cde45593cd230c31a851e55323278060927cabaccb2a4a76d29ac0e36"
    end
  end

  def install
    bin.install Dir["remotelink-go-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.5.1", shell_output("#{bin}/remotelink --version").strip
  end
end
