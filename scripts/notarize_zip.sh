app_path="Edison Mail-darwin-x64/Edison Mail.app"
echo "**** start notarize ZIP ****"
## 1. 进入目录
cd app/dist
## 2. North认证app
#echo "**** start notarize-app ****"
#xcrun altool --notarize-app --primary-bundle-id tech.edison.mail.desktop.app --username qzs0390@sina.com --file "$app_path" --password ghak-zlrl-lmbu-feef
## 3.  把ticket打包到app里
echo "**** start stapler staple ****"
xcrun stapler staple "$app_path"
## 4. 检查
echo "**** start validate app ****"
xcrun stapler validate "$app_path"
## 5. 压缩
echo "**** start zip ****"
zip -9 -y -r -9 -X -q "EdisonMail_notarize.zip" "$app_path"
echo "**** Done! ****"