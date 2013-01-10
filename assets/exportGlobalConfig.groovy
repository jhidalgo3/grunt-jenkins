import hudson.*;
import java.util.regex.*;
import hudson.model.*;
import java.lang.*;
import groovy.io.*;
import java.io.*;
import groovy.json.*;	
import java.util.zip.ZipOutputStream;  
import java.util.zip.ZipEntry;
import java.nio.channels.FileChannel;

instance = jenkins.model.Jenkins.instance;

jenkins_home = instance.rootDir
  
String zipFileName = "userContent/config_bck.zip"  
String zipDir = jenkins_home
ZipOutputStream zipFile = new ZipOutputStream(new FileOutputStream(zipDir + "/" + zipFileName))

["config.xml"].each ()  {configFile ->
    def file = new File (zipDir + "/" + configFile);   
    if (file.exists()) {
        zipFile.putNextEntry(new ZipEntry(file.getName()))  
            def buffer = new byte[file.size()]  
            file.withInputStream { i ->  
                def l = i.read(buffer)  
                // check wether the file is empty  
                if (l > 0) {  
                    zipFile.write(buffer, 0, l)  
                }  
        }
        zipFile.closeEntry()            
    }
}
zipFile.close()

println ("OK");